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
import os from 'os';
import { COLUMN, NUM, STRING, TYPEOF } from '../constants/index.js';
const CONFIG_CATEGORY = Object.freeze(stryMutAct_9fa48("52535") ? {} : (stryCov_9fa48("52535"), {
  RAFT: stryMutAct_9fa48("52536") ? "" : (stryCov_9fa48("52536"), 'raft'),
  MESSAGE_GROUP: stryMutAct_9fa48("52537") ? "" : (stryCov_9fa48("52537"), 'messageGroup'),
  PARTITION: stryMutAct_9fa48("52538") ? "" : (stryCov_9fa48("52538"), 'partition'),
  LOGGING: stryMutAct_9fa48("52539") ? "" : (stryCov_9fa48("52539"), 'logging'),
  NODE: stryMutAct_9fa48("52540") ? "" : (stryCov_9fa48("52540"), 'node'),
  CONTROL_PLANE: stryMutAct_9fa48("52541") ? "" : (stryCov_9fa48("52541"), 'controlPlane'),
  LATENCY: stryMutAct_9fa48("52542") ? "" : (stryCov_9fa48("52542"), 'latency')
}));
const CONFIG_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("52543") ? {} : (stryCov_9fa48("52543"), {
  DYNAMIC_CONFIG: stryMutAct_9fa48("52544") ? "" : (stryCov_9fa48("52544"), 'dynamic-config')
}));
const CONFIG_EVENT = Object.freeze(stryMutAct_9fa48("52545") ? {} : (stryCov_9fa48("52545"), {
  CHANGE: stryMutAct_9fa48("52546") ? "" : (stryCov_9fa48("52546"), 'change'),
  DELETE: stryMutAct_9fa48("52547") ? "" : (stryCov_9fa48("52547"), 'delete')
}));
const CONFIG_VALUE_TYPE = Object.freeze(stryMutAct_9fa48("52548") ? {} : (stryCov_9fa48("52548"), {
  STRING: stryMutAct_9fa48("52549") ? "" : (stryCov_9fa48("52549"), 'string'),
  NUMBER: stryMutAct_9fa48("52550") ? "" : (stryCov_9fa48("52550"), 'number'),
  BOOLEAN: stryMutAct_9fa48("52551") ? "" : (stryCov_9fa48("52551"), 'boolean'),
  JSON: stryMutAct_9fa48("52552") ? "" : (stryCov_9fa48("52552"), 'json')
}));
const CONFIG_SEED_SOURCE = Object.freeze(stryMutAct_9fa48("52553") ? {} : (stryCov_9fa48("52553"), {
  SYSTEM: stryMutAct_9fa48("52554") ? "" : (stryCov_9fa48("52554"), 'system')
}));
const CONFIG_SEPARATOR = Object.freeze(stryMutAct_9fa48("52555") ? {} : (stryCov_9fa48("52555"), {
  COMMA_SPACE: stryMutAct_9fa48("52556") ? "" : (stryCov_9fa48("52556"), ', '),
  DOT: stryMutAct_9fa48("52557") ? "" : (stryCov_9fa48("52557"), '.'),
  UNDERSCORE: stryMutAct_9fa48("52558") ? "" : (stryCov_9fa48("52558"), '_'),
  COLON_SPACE: stryMutAct_9fa48("52559") ? "" : (stryCov_9fa48("52559"), ': ')
}));
const CONFIG_ENV = Object.freeze(stryMutAct_9fa48("52560") ? {} : (stryCov_9fa48("52560"), {
  UPDATED_BY_SYSTEM: stryMutAct_9fa48("52561") ? "" : (stryCov_9fa48("52561"), 'system'),
  UPDATED_BY_UNKNOWN: stryMutAct_9fa48("52562") ? "" : (stryCov_9fa48("52562"), 'unknown'),
  TRUE: stryMutAct_9fa48("52563") ? "" : (stryCov_9fa48("52563"), 'true'),
  FALSE: stryMutAct_9fa48("52564") ? "" : (stryCov_9fa48("52564"), 'false'),
  ONE: stryMutAct_9fa48("52565") ? "" : (stryCov_9fa48("52565"), '1')
}));
const CONFIG_ENV_REGEX = Object.freeze(stryMutAct_9fa48("52566") ? {} : (stryCov_9fa48("52566"), {
  DOT: /\./g,
  CAMEL_CASE: stryMutAct_9fa48("52568") ? /([a-z])([^A-Z])/g : stryMutAct_9fa48("52567") ? /([^a-z])([A-Z])/g : (stryCov_9fa48("52567", "52568"), /([a-z])([A-Z])/g)
}));
const CONFIG_ENV_REPLACE = Object.freeze(stryMutAct_9fa48("52569") ? {} : (stryCov_9fa48("52569"), {
  CAMEL_CASE: stryMutAct_9fa48("52570") ? "" : (stryCov_9fa48("52570"), '$1_$2')
}));
const CONFIG_KEY_FRAGMENT = Object.freeze(stryMutAct_9fa48("52571") ? {} : (stryCov_9fa48("52571"), {
  THRESHOLD: stryMutAct_9fa48("52572") ? "" : (stryCov_9fa48("52572"), 'Threshold')
}));
const CONFIG_LOG_LEVELS = Object.freeze(stryMutAct_9fa48("52573") ? {} : (stryCov_9fa48("52573"), {
  VALUES: Object.freeze(stryMutAct_9fa48("52574") ? [] : (stryCov_9fa48("52574"), [stryMutAct_9fa48("52575") ? "" : (stryCov_9fa48("52575"), 'trace'), stryMutAct_9fa48("52576") ? "" : (stryCov_9fa48("52576"), 'debug'), stryMutAct_9fa48("52577") ? "" : (stryCov_9fa48("52577"), 'info'), stryMutAct_9fa48("52578") ? "" : (stryCov_9fa48("52578"), 'warn'), stryMutAct_9fa48("52579") ? "" : (stryCov_9fa48("52579"), 'error'), stryMutAct_9fa48("52580") ? "" : (stryCov_9fa48("52580"), 'fatal')]))
}));
const LATENCY_PROPAGATION_MODE = Object.freeze(stryMutAct_9fa48("52581") ? {} : (stryCov_9fa48("52581"), {
  SAFE: stryMutAct_9fa48("52582") ? "" : (stryCov_9fa48("52582"), 'safe'),
  GROUPED: stryMutAct_9fa48("52583") ? "" : (stryCov_9fa48("52583"), 'grouped')
}));
const CONFIG_LOG_MSG = Object.freeze(stryMutAct_9fa48("52584") ? {} : (stryCov_9fa48("52584"), {
  INITIALIZED: stryMutAct_9fa48("52585") ? "" : (stryCov_9fa48("52585"), 'Dynamic configuration service initialized'),
  SEEDING_COMPLETE: stryMutAct_9fa48("52586") ? "" : (stryCov_9fa48("52586"), 'Configuration seeding complete'),
  UPDATED: stryMutAct_9fa48("52587") ? "" : (stryCov_9fa48("52587"), 'Configuration updated'),
  WATCHER_REGISTERED: stryMutAct_9fa48("52588") ? "" : (stryCov_9fa48("52588"), 'Configuration watcher registered'),
  WATCHER_CALLBACK_FAILED: stryMutAct_9fa48("52589") ? "" : (stryCov_9fa48("52589"), 'Configuration watcher callback failed')
}));
const CONFIG_ERROR_MSG = Object.freeze(stryMutAct_9fa48("52590") ? {} : (stryCov_9fa48("52590"), {
  SYSTEM_TABLE_CACHE_REQUIRED: stryMutAct_9fa48("52591") ? "" : (stryCov_9fa48("52591"), 'DynamicConfigService requires systemTableCache'),
  CDC_UNAVAILABLE: stryMutAct_9fa48("52592") ? "" : (stryCov_9fa48("52592"), 'CDC integration service not available'),
  INVALID_VALUE_PREFIX: stryMutAct_9fa48("52593") ? "" : (stryCov_9fa48("52593"), 'Invalid configuration value: '),
  EXPECTED_STRING_PREFIX: stryMutAct_9fa48("52594") ? "" : (stryCov_9fa48("52594"), 'Expected string, got '),
  EXPECTED_NUMBER_PREFIX: stryMutAct_9fa48("52595") ? "" : (stryCov_9fa48("52595"), 'Expected number, got '),
  EXPECTED_BOOLEAN_PREFIX: stryMutAct_9fa48("52596") ? "" : (stryCov_9fa48("52596"), 'Expected boolean, got '),
  EXPECTED_OBJECT_PREFIX: stryMutAct_9fa48("52597") ? "" : (stryCov_9fa48("52597"), 'Expected object, got '),
  NON_NEGATIVE_REQUIRED: stryMutAct_9fa48("52598") ? "" : (stryCov_9fa48("52598"), 'Value must be non-negative'),
  LOG_LEVEL_INVALID_PREFIX: stryMutAct_9fa48("52599") ? "" : (stryCov_9fa48("52599"), 'Invalid log level. Must be one of: '),
  VALIDATION_FAILED_PREFIX: stryMutAct_9fa48("52600") ? "" : (stryCov_9fa48("52600"), 'Configuration validation failed: '),
  INVALID_NUMBER_PREFIX: stryMutAct_9fa48("52601") ? "" : (stryCov_9fa48("52601"), 'Invalid number value for ')
}));
const CONFIG_STATS_DEFAULT = Object.freeze(stryMutAct_9fa48("52602") ? {} : (stryCov_9fa48("52602"), {
  reads: NUM.ZERO,
  writes: NUM.ZERO,
  watcherNotifications: NUM.ZERO
}));
const CONFIG_TABLE_COLUMN = Object.freeze(stryMutAct_9fa48("52603") ? {} : (stryCov_9fa48("52603"), {
  KEY: COLUMN.CONFIG_KEY,
  VALUE: COLUMN.CONFIG_VALUE,
  VALUE_TYPE: COLUMN.VALUE_TYPE,
  REQUIRES_RESTART: COLUMN.REQUIRES_RESTART,
  DESCRIPTION: COLUMN.DESCRIPTION,
  DEFAULT_VALUE: COLUMN.DEFAULT_VALUE,
  UPDATED_BY: COLUMN.UPDATED_BY,
  UPDATED_AT: COLUMN.UPDATED_AT,
  CREATED_AT: COLUMN.CREATED_AT
}));
const CONFIG_VALUE_DEFAULT = Object.freeze(stryMutAct_9fa48("52604") ? {} : (stryCov_9fa48("52604"), {
  EMPTY_OBJECT: Object.freeze({})
}));

// Canonical string keys for configuration settings. Prefer these over ad-hoc
// string literals so config access is consistent across the codebase.
const CONFIG_KEY = Object.freeze(stryMutAct_9fa48("52605") ? {} : (stryCov_9fa48("52605"), {
  NODE_ID: stryMutAct_9fa48("52606") ? "" : (stryCov_9fa48("52606"), 'node.id'),
  NODE_HEARTBEAT_INTERVAL_MS: stryMutAct_9fa48("52607") ? "" : (stryCov_9fa48("52607"), 'node.heartbeatIntervalMs'),
  NODE_HEARTBEAT_TIMEOUT_MS: stryMutAct_9fa48("52608") ? "" : (stryCov_9fa48("52608"), 'node.heartbeatTimeoutMs'),
  NODE_STATS_COLLECTION_INTERVAL_MS: stryMutAct_9fa48("52609") ? "" : (stryCov_9fa48("52609"), 'node.statsCollectionIntervalMs'),
  NODE_MAX_SERVICES_PER_NODE: stryMutAct_9fa48("52610") ? "" : (stryCov_9fa48("52610"), 'node.maxServicesPerNode'),
  NODE_REST_API_PORT: stryMutAct_9fa48("52611") ? "" : (stryCov_9fa48("52611"), 'node.restApiPort'),
  NODE_WS_PORT: stryMutAct_9fa48("52612") ? "" : (stryCov_9fa48("52612"), 'node.wsPort'),
  NODE_FAILURE_DETECTION_INTERVAL_MS: stryMutAct_9fa48("52613") ? "" : (stryCov_9fa48("52613"), 'node.failureDetectionIntervalMs'),
  NODE_ADDRESS: stryMutAct_9fa48("52614") ? "" : (stryCov_9fa48("52614"), 'node.address'),
  NODE_ADVERTISED_WS_ADDRESS: stryMutAct_9fa48("52615") ? "" : (stryCov_9fa48("52615"), 'node.advertisedWsAddress'),
  NODE_SEED_NODE_ADDRESS: stryMutAct_9fa48("52616") ? "" : (stryCov_9fa48("52616"), 'node.seedNodeAddress'),
  NODE_SEED_NODE_WS_ADDRESS: stryMutAct_9fa48("52617") ? "" : (stryCov_9fa48("52617"), 'node.seedNodeWsAddress'),
  RAFT_ELECTION_TIMEOUT_MIN_MS: stryMutAct_9fa48("52618") ? "" : (stryCov_9fa48("52618"), 'raft.electionTimeoutMinMs'),
  RAFT_ELECTION_TIMEOUT_MAX_MS: stryMutAct_9fa48("52619") ? "" : (stryCov_9fa48("52619"), 'raft.electionTimeoutMaxMs'),
  RAFT_HEARTBEAT_INTERVAL_MS: stryMutAct_9fa48("52620") ? "" : (stryCov_9fa48("52620"), 'raft.heartbeatIntervalMs'),
  RAFT_TICK_INTERVAL_MS: stryMutAct_9fa48("52621") ? "" : (stryCov_9fa48("52621"), 'raft.tickIntervalMs'),
  RAFT_ADAPTIVE_TIMING_ENABLED: stryMutAct_9fa48("52622") ? "" : (stryCov_9fa48("52622"), 'raft.adaptiveTimingEnabled'),
  RAFT_ADAPTIVE_TIMING_SAMPLE_INTERVAL_MS: stryMutAct_9fa48("52623") ? "" : (stryCov_9fa48("52623"), 'raft.adaptiveTimingSampleIntervalMs'),
  RAFT_ADAPTIVE_TIMING_PROMOTE_SAMPLES: stryMutAct_9fa48("52624") ? "" : (stryCov_9fa48("52624"), 'raft.adaptiveTimingPromoteSamples'),
  RAFT_ADAPTIVE_TIMING_DEMOTE_SAMPLES: stryMutAct_9fa48("52625") ? "" : (stryCov_9fa48("52625"), 'raft.adaptiveTimingDemoteSamples'),
  RAFT_ADAPTIVE_TIMING_HIGH_CPU_PERCENT: stryMutAct_9fa48("52626") ? "" : (stryCov_9fa48("52626"), 'raft.adaptiveTimingHighCpuPercent'),
  RAFT_ADAPTIVE_TIMING_LOW_CPU_PERCENT: stryMutAct_9fa48("52627") ? "" : (stryCov_9fa48("52627"), 'raft.adaptiveTimingLowCpuPercent'),
  RAFT_ADAPTIVE_TIMING_HIGH_WRITE_BYTES_PER_SEC: stryMutAct_9fa48("52628") ? "" : (stryCov_9fa48("52628"), 'raft.adaptiveTimingHighWriteBytesPerSec'),
  RAFT_ADAPTIVE_TIMING_LOW_WRITE_BYTES_PER_SEC: stryMutAct_9fa48("52629") ? "" : (stryCov_9fa48("52629"), 'raft.adaptiveTimingLowWriteBytesPerSec'),
  RAFT_ADAPTIVE_TIMING_HIGH_RSS_GROWTH_BYTES_PER_MIN: stryMutAct_9fa48("52630") ? "" : (stryCov_9fa48("52630"), 'raft.adaptiveTimingHighRssGrowthBytesPerMin'),
  RAFT_ADAPTIVE_TIMING_LOW_RSS_GROWTH_BYTES_PER_MIN: stryMutAct_9fa48("52631") ? "" : (stryCov_9fa48("52631"), 'raft.adaptiveTimingLowRssGrowthBytesPerMin'),
  RAFT_ADAPTIVE_TIMING_ACTIVE_HEARTBEAT_INTERVAL_MS: stryMutAct_9fa48("52632") ? "" : (stryCov_9fa48("52632"), 'raft.adaptiveTimingActiveHeartbeatIntervalMs'),
  RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MIN_MS: stryMutAct_9fa48("52633") ? "" : (stryCov_9fa48("52633"), 'raft.adaptiveTimingActiveElectionTimeoutMinMs'),
  RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MAX_MS: stryMutAct_9fa48("52634") ? "" : (stryCov_9fa48("52634"), 'raft.adaptiveTimingActiveElectionTimeoutMaxMs'),
  RAFT_ADAPTIVE_TIMING_IDLE_HEARTBEAT_INTERVAL_MS: stryMutAct_9fa48("52635") ? "" : (stryCov_9fa48("52635"), 'raft.adaptiveTimingIdleHeartbeatIntervalMs'),
  RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MIN_MS: stryMutAct_9fa48("52636") ? "" : (stryCov_9fa48("52636"), 'raft.adaptiveTimingIdleElectionTimeoutMinMs'),
  RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MAX_MS: stryMutAct_9fa48("52637") ? "" : (stryCov_9fa48("52637"), 'raft.adaptiveTimingIdleElectionTimeoutMaxMs'),
  RAFT_LEADER_ACTIVATION_STABILIZATION_MS: stryMutAct_9fa48("52638") ? "" : (stryCov_9fa48("52638"), 'raft.leaderActivationStabilizationMs'),
  RAFT_LEADER_ACTIVATION_NODE_SPACING_MS: stryMutAct_9fa48("52639") ? "" : (stryCov_9fa48("52639"), 'raft.leaderActivationNodeSpacingMs'),
  MESSAGE_GROUP_REPLICA_COUNT: stryMutAct_9fa48("52640") ? "" : (stryCov_9fa48("52640"), 'messageGroup.replicaCount'),
  MESSAGE_GROUP_DELIVERY_TIMEOUT_MS: stryMutAct_9fa48("52641") ? "" : (stryCov_9fa48("52641"), 'messageGroup.deliveryTimeoutMs'),
  MESSAGE_GROUP_RETRY_MAX_ATTEMPTS: stryMutAct_9fa48("52642") ? "" : (stryCov_9fa48("52642"), 'messageGroup.retryMaxAttempts'),
  MESSAGE_GROUP_RETRY_INITIAL_DELAY_MS: stryMutAct_9fa48("52643") ? "" : (stryCov_9fa48("52643"), 'messageGroup.retryInitialDelayMs'),
  MESSAGE_GROUP_RETRY_MAX_DELAY_MS: stryMutAct_9fa48("52644") ? "" : (stryCov_9fa48("52644"), 'messageGroup.retryMaxDelayMs'),
  MESSAGE_GROUP_RETRY_BACKOFF_MULTIPLIER: stryMutAct_9fa48("52645") ? "" : (stryCov_9fa48("52645"), 'messageGroup.retryBackoffMultiplier'),
  MESSAGE_GROUP_RETRY_JITTER_FACTOR: stryMutAct_9fa48("52646") ? "" : (stryCov_9fa48("52646"), 'messageGroup.retryJitterFactor'),
  MESSAGE_GROUP_CACHE_TTL_MS: stryMutAct_9fa48("52647") ? "" : (stryCov_9fa48("52647"), 'messageGroup.cacheTtlMs'),
  MESSAGE_GROUP_CDC_BUFFER_SIZE: stryMutAct_9fa48("52648") ? "" : (stryCov_9fa48("52648"), 'messageGroup.cdcBufferSize'),
  MESSAGE_GROUP_CDC_FLUSH_INTERVAL_MS: stryMutAct_9fa48("52649") ? "" : (stryCov_9fa48("52649"), 'messageGroup.cdcFlushIntervalMs'),
  PARTITION_DEFAULT_REPLICA_COUNT: stryMutAct_9fa48("52650") ? "" : (stryCov_9fa48("52650"), 'partition.defaultReplicaCount'),
  PARTITION_SIZE_UPDATE_DEBOUNCE_MS: stryMutAct_9fa48("52651") ? "" : (stryCov_9fa48("52651"), 'partition.sizeUpdateDebounceMs'),
  PARTITION_SIZE_UPDATE_INTERVAL_MS: stryMutAct_9fa48("52652") ? "" : (stryCov_9fa48("52652"), 'partition.sizeUpdateIntervalMs'),
  PARTITION_SPLIT_THRESHOLD_BYTES: stryMutAct_9fa48("52653") ? "" : (stryCov_9fa48("52653"), 'partition.splitThresholdBytes'),
  PARTITION_SPLIT_THRESHOLD_QPM: stryMutAct_9fa48("52654") ? "" : (stryCov_9fa48("52654"), 'partition.splitThresholdQpm'),
  PARTITION_MERGE_THRESHOLD_BYTES: stryMutAct_9fa48("52655") ? "" : (stryCov_9fa48("52655"), 'partition.mergeThresholdBytes'),
  PARTITION_MERGE_THRESHOLD_QPM: stryMutAct_9fa48("52656") ? "" : (stryCov_9fa48("52656"), 'partition.mergeThresholdQpm'),
  PARTITION_EVALUATION_INTERVAL_MS: stryMutAct_9fa48("52657") ? "" : (stryCov_9fa48("52657"), 'partition.evaluationIntervalMs'),
  LOGGING_LEVEL: stryMutAct_9fa48("52658") ? "" : (stryCov_9fa48("52658"), 'logging.level'),
  LOGGING_RETENTION_DAYS: stryMutAct_9fa48("52659") ? "" : (stryCov_9fa48("52659"), 'logging.retentionDays'),
  LOGGING_PRETTY_PRINT: stryMutAct_9fa48("52660") ? "" : (stryCov_9fa48("52660"), 'logging.prettyPrint'),
  LOGGING_BUFFER_SIZE: stryMutAct_9fa48("52661") ? "" : (stryCov_9fa48("52661"), 'logging.bufferSize'),
  LOGGING_BATCH_SIZE: stryMutAct_9fa48("52662") ? "" : (stryCov_9fa48("52662"), 'logging.batchSize'),
  LOGGING_FLUSH_INTERVAL_MS: stryMutAct_9fa48("52663") ? "" : (stryCov_9fa48("52663"), 'logging.flushIntervalMs'),
  LOGGING_MAX_RETRIES: stryMutAct_9fa48("52664") ? "" : (stryCov_9fa48("52664"), 'logging.maxRetries'),
  LOGGING_RETRY_DELAY_MS: stryMutAct_9fa48("52665") ? "" : (stryCov_9fa48("52665"), 'logging.retryDelayMs'),
  LOGGING_PERSIST_METRICS_LOGS: stryMutAct_9fa48("52666") ? "" : (stryCov_9fa48("52666"), 'logging.persistMetricsLogs'),
  LOGGING_METRICS_DEFAULT_RESOLUTION_MS: stryMutAct_9fa48("52667") ? "" : (stryCov_9fa48("52667"), 'logging.metricsDefaultResolutionMs'),
  LOGGING_METRICS_DETAILED_WINDOW_ENABLED: stryMutAct_9fa48("52668") ? "" : (stryCov_9fa48("52668"), 'logging.metricsDetailedWindowEnabled'),
  LOGGING_METRICS_DETAILED_WINDOW_TTL_MS: stryMutAct_9fa48("52669") ? "" : (stryCov_9fa48("52669"), 'logging.metricsDetailedWindowTtlMs'),
  LOGGING_QUERY_DEFAULT_LIMIT: stryMutAct_9fa48("52670") ? "" : (stryCov_9fa48("52670"), 'logging.queryDefaultLimit'),
  LOGGING_QUERY_MAX_LIMIT: stryMutAct_9fa48("52671") ? "" : (stryCov_9fa48("52671"), 'logging.queryMaxLimit'),
  LOGGING_DEFAULT_TIME_RANGE_MS: stryMutAct_9fa48("52672") ? "" : (stryCov_9fa48("52672"), 'logging.defaultTimeRangeMs'),
  LOGGING_RETENTION_PERIOD_MS: stryMutAct_9fa48("52673") ? "" : (stryCov_9fa48("52673"), 'logging.retentionPeriodMs'),
  LOGGING_CLEANUP_INTERVAL_MS: stryMutAct_9fa48("52674") ? "" : (stryCov_9fa48("52674"), 'logging.cleanupIntervalMs'),
  LOGGING_CLEANUP_BATCH_SIZE: stryMutAct_9fa48("52675") ? "" : (stryCov_9fa48("52675"), 'logging.cleanupBatchSize'),
  LOGGING_MAX_DELETES_PER_RUN: stryMutAct_9fa48("52676") ? "" : (stryCov_9fa48("52676"), 'logging.maxDeletesPerRun'),
  REBALANCER_PERIODIC_CHECK_INTERVAL_MS: stryMutAct_9fa48("52677") ? "" : (stryCov_9fa48("52677"), 'rebalancer.periodicCheckIntervalMs'),
  REBALANCER_MAX_CONCURRENT_MOVES: stryMutAct_9fa48("52678") ? "" : (stryCov_9fa48("52678"), 'rebalancer.maxConcurrentMoves'),
  REBALANCER_SYSTEM_PARTITION_START_DELAY_MS: stryMutAct_9fa48("52679") ? "" : (stryCov_9fa48("52679"), 'rebalancer.systemPartitionStartDelayMs'),
  REBALANCER_USER_PARTITION_START_DELAY_MS: stryMutAct_9fa48("52680") ? "" : (stryCov_9fa48("52680"), 'rebalancer.userPartitionStartDelayMs'),
  QUERY_TIMEOUT_MS: stryMutAct_9fa48("52681") ? "" : (stryCov_9fa48("52681"), 'query.timeoutMs'),
  QUERY_MAX_PARALLEL_PARTITIONS: stryMutAct_9fa48("52682") ? "" : (stryCov_9fa48("52682"), 'query.maxParallelPartitions'),
  QUERY_LEADER_RETRY_ATTEMPTS: stryMutAct_9fa48("52683") ? "" : (stryCov_9fa48("52683"), 'query.leaderRetryAttempts'),
  QUERY_LEADER_RETRY_DELAY_MS: stryMutAct_9fa48("52684") ? "" : (stryCov_9fa48("52684"), 'query.leaderRetryDelayMs'),
  QUERY_READ_RETRY_ATTEMPTS: stryMutAct_9fa48("52685") ? "" : (stryCov_9fa48("52685"), 'query.readRetryAttempts'),
  QUERY_COORDINATOR_MAX_PARALLEL_PARTITIONS: stryMutAct_9fa48("52686") ? "" : (stryCov_9fa48("52686"), 'queryCoordinator.maxParallelPartitions'),
  QUERY_COORDINATOR_MAX_CONCURRENT_CONNECTIONS: stryMutAct_9fa48("52687") ? "" : (stryCov_9fa48("52687"), 'queryCoordinator.maxConcurrentConnections'),
  QUERY_COORDINATOR_MAX_RESULT_BUFFER_BYTES: stryMutAct_9fa48("52688") ? "" : (stryCov_9fa48("52688"), 'queryCoordinator.maxResultBufferBytes'),
  QUERY_COORDINATOR_QUERY_TIMEOUT_MS: stryMutAct_9fa48("52689") ? "" : (stryCov_9fa48("52689"), 'queryCoordinator.queryTimeoutMs'),
  QUERY_COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER: stryMutAct_9fa48("52690") ? "" : (stryCov_9fa48("52690"), 'queryCoordinator.stragglerThresholdMultiplier'),
  QUERY_COORDINATOR_SPECULATIVE_EXECUTION_ENABLED: stryMutAct_9fa48("52691") ? "" : (stryCov_9fa48("52691"), 'queryCoordinator.speculativeExecutionEnabled'),
  QUERY_COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS: stryMutAct_9fa48("52692") ? "" : (stryCov_9fa48("52692"), 'queryCoordinator.speculativeExecutionDelayMs'),
  QUERY_COORDINATOR_STREAMING_ENABLED: stryMutAct_9fa48("52693") ? "" : (stryCov_9fa48("52693"), 'queryCoordinator.streamingEnabled'),
  QUERY_COORDINATOR_STREAMING_CHUNK_SIZE: stryMutAct_9fa48("52694") ? "" : (stryCov_9fa48("52694"), 'queryCoordinator.streamingChunkSize'),
  INDEX_DEFAULT_TYPE: stryMutAct_9fa48("52695") ? "" : (stryCov_9fa48("52695"), 'index.defaultType'),
  LIVE_QUERY_DEFAULT_TTL_MS: stryMutAct_9fa48("52696") ? "" : (stryCov_9fa48("52696"), 'liveQuery.defaultTtlMs'),
  LIVE_QUERY_MAX_PER_CLIENT: stryMutAct_9fa48("52697") ? "" : (stryCov_9fa48("52697"), 'liveQuery.maxPerClient'),
  LIVE_QUERY_CLEANUP_INTERVAL_MS: stryMutAct_9fa48("52698") ? "" : (stryCov_9fa48("52698"), 'liveQuery.cleanupIntervalMs'),
  LIVE_QUERY_CURSOR_RETENTION_MS: stryMutAct_9fa48("52699") ? "" : (stryCov_9fa48("52699"), 'liveQuery.cursorRetentionMs'),
  CONTROL_PLANE_READY_LEASE_MS: stryMutAct_9fa48("52700") ? "" : (stryCov_9fa48("52700"), 'controlPlane.readyLeaseMs'),
  CONTROL_PLANE_HEARTBEAT_INTERVAL_MS: stryMutAct_9fa48("52701") ? "" : (stryCov_9fa48("52701"), 'controlPlane.heartbeatIntervalMs'),
  CONTROL_PLANE_LEASE_SWEEP_INTERVAL_MS: stryMutAct_9fa48("52702") ? "" : (stryCov_9fa48("52702"), 'controlPlane.leaseSweepIntervalMs'),
  HLC_MAX_DRIFT_MS: stryMutAct_9fa48("52703") ? "" : (stryCov_9fa48("52703"), 'hlc.maxDriftMs'),
  HLC_MAX_LOGICAL_COUNTER: stryMutAct_9fa48("52704") ? "" : (stryCov_9fa48("52704"), 'hlc.maxLogicalCounter'),
  WORKER_MIN_THREADS: stryMutAct_9fa48("52705") ? "" : (stryCov_9fa48("52705"), 'worker.minThreads'),
  WORKER_MAX_THREADS: stryMutAct_9fa48("52706") ? "" : (stryCov_9fa48("52706"), 'worker.maxThreads'),
  WORKER_IDLE_TIMEOUT_MS: stryMutAct_9fa48("52707") ? "" : (stryCov_9fa48("52707"), 'worker.idleTimeoutMs'),
  STORAGE_DATA_DIR: stryMutAct_9fa48("52708") ? "" : (stryCov_9fa48("52708"), 'storage.dataDir'),
  ADMIN_QUERY_TIMEOUT_MS: stryMutAct_9fa48("52709") ? "" : (stryCov_9fa48("52709"), 'admin.queryTimeoutMs'),
  ADMIN_CACHE_DUMP_TIMEOUT_MS: stryMutAct_9fa48("52710") ? "" : (stryCov_9fa48("52710"), 'admin.cacheDumpTimeoutMs'),
  FUNCTION_QUERY_TIMEOUT_MS: stryMutAct_9fa48("52711") ? "" : (stryCov_9fa48("52711"), 'function.queryTimeoutMs'),
  FUNCTION_QUERY_BATCH_SIZE: stryMutAct_9fa48("52712") ? "" : (stryCov_9fa48("52712"), 'function.queryBatchSize'),
  POLICY_CACHE_TTL_MS: stryMutAct_9fa48("52713") ? "" : (stryCov_9fa48("52713"), 'policy.cacheTTLMs'),
  LIFECYCLE_OPERATION_TIMEOUT_MS: stryMutAct_9fa48("52714") ? "" : (stryCov_9fa48("52714"), 'lifecycle.operationTimeoutMs'),
  LIFECYCLE_SYNC_TIMEOUT_MS: stryMutAct_9fa48("52715") ? "" : (stryCov_9fa48("52715"), 'lifecycle.syncTimeoutMs'),
  REPLICA_HANDLER_SYNC_TIMEOUT_MS: stryMutAct_9fa48("52716") ? "" : (stryCov_9fa48("52716"), 'replicaHandler.syncTimeoutMs'),
  FAILURE_DETECTOR_CHECK_INTERVAL_MS: stryMutAct_9fa48("52717") ? "" : (stryCov_9fa48("52717"), 'failureDetector.checkIntervalMs'),
  FAILURE_DETECTOR_SUSPICION_THRESHOLD_MS: stryMutAct_9fa48("52718") ? "" : (stryCov_9fa48("52718"), 'failureDetector.suspicionThresholdMs'),
  FAILURE_DETECTOR_FAILURE_THRESHOLD_MS: stryMutAct_9fa48("52719") ? "" : (stryCov_9fa48("52719"), 'failureDetector.failureThresholdMs'),
  FAILURE_DETECTOR_FLAPPING_WINDOW_MS: stryMutAct_9fa48("52720") ? "" : (stryCov_9fa48("52720"), 'failureDetector.flappingWindowMs'),
  FAILURE_DETECTOR_FLAPPING_THRESHOLD: stryMutAct_9fa48("52721") ? "" : (stryCov_9fa48("52721"), 'failureDetector.flappingThreshold'),
  FAILURE_DETECTOR_ADAPTIVE_MAX_THRESHOLD_MS: stryMutAct_9fa48("52722") ? "" : (stryCov_9fa48("52722"), 'failureDetector.adaptiveMaxThresholdMs'),
  FAILURE_DETECTOR_STABILITY_PERIOD_MS: stryMutAct_9fa48("52723") ? "" : (stryCov_9fa48("52723"), 'failureDetector.stabilityPeriodMs'),
  NODE_REINTEGRATION_CHECK_INTERVAL_MS: stryMutAct_9fa48("52724") ? "" : (stryCov_9fa48("52724"), 'nodeReintegration.checkIntervalMs'),
  NODE_REINTEGRATION_DELAY_MS: stryMutAct_9fa48("52725") ? "" : (stryCov_9fa48("52725"), 'nodeReintegration.reintegrationDelayMs'),
  NODE_REINTEGRATION_HEALTH_CHECK_COUNT: stryMutAct_9fa48("52726") ? "" : (stryCov_9fa48("52726"), 'nodeReintegration.healthCheckCount'),
  NODE_REINTEGRATION_HEALTH_CHECK_INTERVAL_MS: stryMutAct_9fa48("52727") ? "" : (stryCov_9fa48("52727"), 'nodeReintegration.healthCheckIntervalMs'),
  REPLICA_RECOVERY_CHECK_INTERVAL_MS: stryMutAct_9fa48("52728") ? "" : (stryCov_9fa48("52728"), 'replicaRecovery.checkIntervalMs'),
  REPLICA_RECOVERY_MIN_PARTITION_REPLICAS: stryMutAct_9fa48("52729") ? "" : (stryCov_9fa48("52729"), 'replicaRecovery.minPartitionReplicas'),
  REPLICA_RECOVERY_MIN_MESSAGE_GROUP_REPLICAS: stryMutAct_9fa48("52730") ? "" : (stryCov_9fa48("52730"), 'replicaRecovery.minMessageGroupReplicas'),
  REPLICA_RECOVERY_DELAY_MS: stryMutAct_9fa48("52731") ? "" : (stryCov_9fa48("52731"), 'replicaRecovery.recoveryDelayMs'),
  TRANSPORT_CONNECTION_POOL_TTL_MS: stryMutAct_9fa48("52732") ? "" : (stryCov_9fa48("52732"), 'transport.connectionPoolTtlMs'),
  TRANSPORT_CONNECTION_POOL_CLEANUP_INTERVAL_MS: stryMutAct_9fa48("52733") ? "" : (stryCov_9fa48("52733"), 'transport.connectionPoolCleanupIntervalMs'),
  // Storage capacity budget (node-level startup)
  NODE_STORAGE_BUDGET_BYTES: stryMutAct_9fa48("52734") ? "" : (stryCov_9fa48("52734"), 'node.storageBudgetBytes'),
  NODE_STORAGE_BUDGET_RATIO: stryMutAct_9fa48("52735") ? "" : (stryCov_9fa48("52735"), 'node.storageBudgetRatio'),
  // Storage capacity rebalancer keys
  REBALANCER_STORAGE_SOFT_PRESSURE_PERCENT: stryMutAct_9fa48("52736") ? "" : (stryCov_9fa48("52736"), 'rebalancer.storageSoftPressurePercent'),
  REBALANCER_STORAGE_HARD_PRESSURE_PERCENT: stryMutAct_9fa48("52737") ? "" : (stryCov_9fa48("52737"), 'rebalancer.storageHardPressurePercent'),
  REBALANCER_STORAGE_RESERVATION_TTL_MS: stryMutAct_9fa48("52738") ? "" : (stryCov_9fa48("52738"), 'rebalancer.storageReservationTtlMs'),
  REBALANCER_STORAGE_EMERGENCY_HEADROOM_PERCENT: stryMutAct_9fa48("52739") ? "" : (stryCov_9fa48("52739"), 'rebalancer.storageEmergencyHeadroomPercent'),
  REBALANCER_MINIMUM_REPLICA_BYTES: stryMutAct_9fa48("52740") ? "" : (stryCov_9fa48("52740"), 'rebalancer.minimumReplicaBytes'),
  REBALANCER_SPLIT_AMPLIFICATION_FACTOR: stryMutAct_9fa48("52741") ? "" : (stryCov_9fa48("52741"), 'rebalancer.splitAmplificationFactor'),
  REBALANCER_PARTITION_REPLICA_OVERHEAD_BYTES: stryMutAct_9fa48("52742") ? "" : (stryCov_9fa48("52742"), 'rebalancer.partitionReplicaOverheadBytes'),
  REBALANCER_MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES: stryMutAct_9fa48("52743") ? "" : (stryCov_9fa48("52743"), 'rebalancer.messageGroupReplicaOverheadBytes'),
  REBALANCER_SERVICE_REPLICA_OVERHEAD_BYTES: stryMutAct_9fa48("52744") ? "" : (stryCov_9fa48("52744"), 'rebalancer.serviceReplicaOverheadBytes'),
  REBALANCER_STORAGE_ADMISSION_MODE: stryMutAct_9fa48("52745") ? "" : (stryCov_9fa48("52745"), 'rebalancer.storageAdmissionMode'),
  // Latency topology keys
  LATENCY_GROUP_THRESHOLD_MS: stryMutAct_9fa48("52746") ? "" : (stryCov_9fa48("52746"), 'latency.groupThresholdMs'),
  LATENCY_RECALC_INTERVAL_MS: stryMutAct_9fa48("52747") ? "" : (stryCov_9fa48("52747"), 'latency.recalcIntervalMs'),
  LATENCY_RECALC_JITTER_RATIO: stryMutAct_9fa48("52748") ? "" : (stryCov_9fa48("52748"), 'latency.recalcJitterRatio'),
  LATENCY_PING_TIMEOUT_MS: stryMutAct_9fa48("52749") ? "" : (stryCov_9fa48("52749"), 'latency.pingTimeoutMs'),
  LATENCY_PING_RETRY_COUNT: stryMutAct_9fa48("52750") ? "" : (stryCov_9fa48("52750"), 'latency.pingRetryCount'),
  LATENCY_SMOOTHING_ALPHA: stryMutAct_9fa48("52751") ? "" : (stryCov_9fa48("52751"), 'latency.smoothingAlpha'),
  LATENCY_PROPAGATION_MODE: stryMutAct_9fa48("52752") ? "" : (stryCov_9fa48("52752"), 'latency.propagationMode')
}));

/**
 * JSON Schema for configuration validation.
 */
const CONFIG_SCHEMA = stryMutAct_9fa48("52753") ? {} : (stryCov_9fa48("52753"), {
  type: stryMutAct_9fa48("52754") ? "" : (stryCov_9fa48("52754"), 'object'),
  properties: stryMutAct_9fa48("52755") ? {} : (stryCov_9fa48("52755"), {
    node: stryMutAct_9fa48("52756") ? {} : (stryCov_9fa48("52756"), {
      type: stryMutAct_9fa48("52757") ? "" : (stryCov_9fa48("52757"), 'object'),
      properties: stryMutAct_9fa48("52758") ? {} : (stryCov_9fa48("52758"), {
        id: stryMutAct_9fa48("52759") ? {} : (stryCov_9fa48("52759"), {
          type: stryMutAct_9fa48("52760") ? "" : (stryCov_9fa48("52760"), 'string'),
          minLength: 1
        }),
        address: stryMutAct_9fa48("52761") ? {} : (stryCov_9fa48("52761"), {
          type: stryMutAct_9fa48("52762") ? "" : (stryCov_9fa48("52762"), 'string')
        }),
        heartbeatIntervalMs: stryMutAct_9fa48("52763") ? {} : (stryCov_9fa48("52763"), {
          type: stryMutAct_9fa48("52764") ? "" : (stryCov_9fa48("52764"), 'number'),
          minimum: 100
        }),
        heartbeatTimeoutMs: stryMutAct_9fa48("52765") ? {} : (stryCov_9fa48("52765"), {
          type: stryMutAct_9fa48("52766") ? "" : (stryCov_9fa48("52766"), 'number'),
          minimum: 500
        }),
        statsCollectionIntervalMs: stryMutAct_9fa48("52767") ? {} : (stryCov_9fa48("52767"), {
          type: stryMutAct_9fa48("52768") ? "" : (stryCov_9fa48("52768"), 'number'),
          minimum: 1000
        }),
        maxServicesPerNode: stryMutAct_9fa48("52769") ? {} : (stryCov_9fa48("52769"), {
          type: stryMutAct_9fa48("52770") ? "" : (stryCov_9fa48("52770"), 'number'),
          minimum: 1
        }),
        restApiPort: stryMutAct_9fa48("52771") ? {} : (stryCov_9fa48("52771"), {
          type: stryMutAct_9fa48("52772") ? "" : (stryCov_9fa48("52772"), 'number'),
          minimum: 1,
          maximum: 65535
        }),
        seedNodeAddress: stryMutAct_9fa48("52773") ? {} : (stryCov_9fa48("52773"), {
          type: stryMutAct_9fa48("52774") ? "" : (stryCov_9fa48("52774"), 'string')
        }),
        storageBudgetBytes: stryMutAct_9fa48("52775") ? {} : (stryCov_9fa48("52775"), {
          type: stryMutAct_9fa48("52776") ? "" : (stryCov_9fa48("52776"), 'number'),
          minimum: 1
        }),
        storageBudgetRatio: stryMutAct_9fa48("52777") ? {} : (stryCov_9fa48("52777"), {
          type: stryMutAct_9fa48("52778") ? "" : (stryCov_9fa48("52778"), 'number'),
          minimum: 0.01,
          maximum: 1.0
        })
      }),
      required: stryMutAct_9fa48("52779") ? [] : (stryCov_9fa48("52779"), [stryMutAct_9fa48("52780") ? "" : (stryCov_9fa48("52780"), 'id')]),
      additionalProperties: stryMutAct_9fa48("52781") ? true : (stryCov_9fa48("52781"), false)
    }),
    raft: stryMutAct_9fa48("52782") ? {} : (stryCov_9fa48("52782"), {
      type: stryMutAct_9fa48("52783") ? "" : (stryCov_9fa48("52783"), 'object'),
      properties: stryMutAct_9fa48("52784") ? {} : (stryCov_9fa48("52784"), {
        electionTimeoutMinMs: stryMutAct_9fa48("52785") ? {} : (stryCov_9fa48("52785"), {
          type: stryMutAct_9fa48("52786") ? "" : (stryCov_9fa48("52786"), 'number'),
          minimum: 100
        }),
        electionTimeoutMaxMs: stryMutAct_9fa48("52787") ? {} : (stryCov_9fa48("52787"), {
          type: stryMutAct_9fa48("52788") ? "" : (stryCov_9fa48("52788"), 'number'),
          minimum: 200
        }),
        heartbeatIntervalMs: stryMutAct_9fa48("52789") ? {} : (stryCov_9fa48("52789"), {
          type: stryMutAct_9fa48("52790") ? "" : (stryCov_9fa48("52790"), 'number'),
          minimum: 10
        }),
        tickIntervalMs: stryMutAct_9fa48("52791") ? {} : (stryCov_9fa48("52791"), {
          type: stryMutAct_9fa48("52792") ? "" : (stryCov_9fa48("52792"), 'number'),
          minimum: 1
        }),
        adaptiveTimingEnabled: stryMutAct_9fa48("52793") ? {} : (stryCov_9fa48("52793"), {
          type: stryMutAct_9fa48("52794") ? "" : (stryCov_9fa48("52794"), 'boolean')
        }),
        adaptiveTimingSampleIntervalMs: stryMutAct_9fa48("52795") ? {} : (stryCov_9fa48("52795"), {
          type: stryMutAct_9fa48("52796") ? "" : (stryCov_9fa48("52796"), 'number'),
          minimum: 1
        }),
        adaptiveTimingPromoteSamples: stryMutAct_9fa48("52797") ? {} : (stryCov_9fa48("52797"), {
          type: stryMutAct_9fa48("52798") ? "" : (stryCov_9fa48("52798"), 'number'),
          minimum: 1
        }),
        adaptiveTimingDemoteSamples: stryMutAct_9fa48("52799") ? {} : (stryCov_9fa48("52799"), {
          type: stryMutAct_9fa48("52800") ? "" : (stryCov_9fa48("52800"), 'number'),
          minimum: 1
        }),
        adaptiveTimingHighCpuPercent: stryMutAct_9fa48("52801") ? {} : (stryCov_9fa48("52801"), {
          type: stryMutAct_9fa48("52802") ? "" : (stryCov_9fa48("52802"), 'number'),
          minimum: 0,
          maximum: 100
        }),
        adaptiveTimingLowCpuPercent: stryMutAct_9fa48("52803") ? {} : (stryCov_9fa48("52803"), {
          type: stryMutAct_9fa48("52804") ? "" : (stryCov_9fa48("52804"), 'number'),
          minimum: 0,
          maximum: 100
        }),
        adaptiveTimingHighWriteBytesPerSec: stryMutAct_9fa48("52805") ? {} : (stryCov_9fa48("52805"), {
          type: stryMutAct_9fa48("52806") ? "" : (stryCov_9fa48("52806"), 'number'),
          minimum: 0
        }),
        adaptiveTimingLowWriteBytesPerSec: stryMutAct_9fa48("52807") ? {} : (stryCov_9fa48("52807"), {
          type: stryMutAct_9fa48("52808") ? "" : (stryCov_9fa48("52808"), 'number'),
          minimum: 0
        }),
        adaptiveTimingHighRssGrowthBytesPerMin: stryMutAct_9fa48("52809") ? {} : (stryCov_9fa48("52809"), {
          type: stryMutAct_9fa48("52810") ? "" : (stryCov_9fa48("52810"), 'number'),
          minimum: 0
        }),
        adaptiveTimingLowRssGrowthBytesPerMin: stryMutAct_9fa48("52811") ? {} : (stryCov_9fa48("52811"), {
          type: stryMutAct_9fa48("52812") ? "" : (stryCov_9fa48("52812"), 'number'),
          minimum: 0
        }),
        adaptiveTimingActiveHeartbeatIntervalMs: stryMutAct_9fa48("52813") ? {} : (stryCov_9fa48("52813"), {
          type: stryMutAct_9fa48("52814") ? "" : (stryCov_9fa48("52814"), 'number'),
          minimum: 10
        }),
        adaptiveTimingActiveElectionTimeoutMinMs: stryMutAct_9fa48("52815") ? {} : (stryCov_9fa48("52815"), {
          type: stryMutAct_9fa48("52816") ? "" : (stryCov_9fa48("52816"), 'number'),
          minimum: 100
        }),
        adaptiveTimingActiveElectionTimeoutMaxMs: stryMutAct_9fa48("52817") ? {} : (stryCov_9fa48("52817"), {
          type: stryMutAct_9fa48("52818") ? "" : (stryCov_9fa48("52818"), 'number'),
          minimum: 200
        }),
        adaptiveTimingIdleHeartbeatIntervalMs: stryMutAct_9fa48("52819") ? {} : (stryCov_9fa48("52819"), {
          type: stryMutAct_9fa48("52820") ? "" : (stryCov_9fa48("52820"), 'number'),
          minimum: 10
        }),
        adaptiveTimingIdleElectionTimeoutMinMs: stryMutAct_9fa48("52821") ? {} : (stryCov_9fa48("52821"), {
          type: stryMutAct_9fa48("52822") ? "" : (stryCov_9fa48("52822"), 'number'),
          minimum: 100
        }),
        adaptiveTimingIdleElectionTimeoutMaxMs: stryMutAct_9fa48("52823") ? {} : (stryCov_9fa48("52823"), {
          type: stryMutAct_9fa48("52824") ? "" : (stryCov_9fa48("52824"), 'number'),
          minimum: 200
        }),
        leaderActivationStabilizationMs: stryMutAct_9fa48("52825") ? {} : (stryCov_9fa48("52825"), {
          type: stryMutAct_9fa48("52826") ? "" : (stryCov_9fa48("52826"), 'number'),
          minimum: 0
        }),
        leaderActivationNodeSpacingMs: stryMutAct_9fa48("52827") ? {} : (stryCov_9fa48("52827"), {
          type: stryMutAct_9fa48("52828") ? "" : (stryCov_9fa48("52828"), 'number'),
          minimum: 0
        }),
        snapshotThreshold: stryMutAct_9fa48("52829") ? {} : (stryCov_9fa48("52829"), {
          type: stryMutAct_9fa48("52830") ? "" : (stryCov_9fa48("52830"), 'number'),
          minimum: 100
        }),
        maxLogEntriesPerAppend: stryMutAct_9fa48("52831") ? {} : (stryCov_9fa48("52831"), {
          type: stryMutAct_9fa48("52832") ? "" : (stryCov_9fa48("52832"), 'number'),
          minimum: 1
        }),
        leadershipWaitTimeoutMs: stryMutAct_9fa48("52833") ? {} : (stryCov_9fa48("52833"), {
          type: stryMutAct_9fa48("52834") ? "" : (stryCov_9fa48("52834"), 'number'),
          minimum: 1000
        }),
        leadershipWaitBackoffMs: stryMutAct_9fa48("52835") ? {} : (stryCov_9fa48("52835"), {
          type: stryMutAct_9fa48("52836") ? "" : (stryCov_9fa48("52836"), 'number'),
          minimum: 100
        })
      }),
      additionalProperties: stryMutAct_9fa48("52837") ? true : (stryCov_9fa48("52837"), false)
    }),
    messageGroup: stryMutAct_9fa48("52838") ? {} : (stryCov_9fa48("52838"), {
      type: stryMutAct_9fa48("52839") ? "" : (stryCov_9fa48("52839"), 'object'),
      properties: stryMutAct_9fa48("52840") ? {} : (stryCov_9fa48("52840"), {
        replicaCount: stryMutAct_9fa48("52841") ? {} : (stryCov_9fa48("52841"), {
          type: stryMutAct_9fa48("52842") ? "" : (stryCov_9fa48("52842"), 'number'),
          minimum: 3
        }),
        deliveryTimeoutMs: stryMutAct_9fa48("52843") ? {} : (stryCov_9fa48("52843"), {
          type: stryMutAct_9fa48("52844") ? "" : (stryCov_9fa48("52844"), 'number'),
          minimum: 100
        }),
        retryMaxAttempts: stryMutAct_9fa48("52845") ? {} : (stryCov_9fa48("52845"), {
          type: stryMutAct_9fa48("52846") ? "" : (stryCov_9fa48("52846"), 'number'),
          minimum: 1
        }),
        retryInitialDelayMs: stryMutAct_9fa48("52847") ? {} : (stryCov_9fa48("52847"), {
          type: stryMutAct_9fa48("52848") ? "" : (stryCov_9fa48("52848"), 'number'),
          minimum: 10
        }),
        retryBackoffMultiplier: stryMutAct_9fa48("52849") ? {} : (stryCov_9fa48("52849"), {
          type: stryMutAct_9fa48("52850") ? "" : (stryCov_9fa48("52850"), 'number'),
          minimum: 1
        }),
        retryMaxDelayMs: stryMutAct_9fa48("52851") ? {} : (stryCov_9fa48("52851"), {
          type: stryMutAct_9fa48("52852") ? "" : (stryCov_9fa48("52852"), 'number'),
          minimum: 100
        }),
        retryJitterFactor: stryMutAct_9fa48("52853") ? {} : (stryCov_9fa48("52853"), {
          type: stryMutAct_9fa48("52854") ? "" : (stryCov_9fa48("52854"), 'number'),
          minimum: 0,
          maximum: 1
        }),
        cdcBufferSize: stryMutAct_9fa48("52855") ? {} : (stryCov_9fa48("52855"), {
          type: stryMutAct_9fa48("52856") ? "" : (stryCov_9fa48("52856"), 'number'),
          minimum: 1
        }),
        cdcFlushIntervalMs: stryMutAct_9fa48("52857") ? {} : (stryCov_9fa48("52857"), {
          type: stryMutAct_9fa48("52858") ? "" : (stryCov_9fa48("52858"), 'number'),
          minimum: 100
        }),
        cacheTtlMs: stryMutAct_9fa48("52859") ? {} : (stryCov_9fa48("52859"), {
          type: stryMutAct_9fa48("52860") ? "" : (stryCov_9fa48("52860"), 'number'),
          minimum: 1000
        })
      }),
      additionalProperties: stryMutAct_9fa48("52861") ? true : (stryCov_9fa48("52861"), false)
    }),
    partition: stryMutAct_9fa48("52862") ? {} : (stryCov_9fa48("52862"), {
      type: stryMutAct_9fa48("52863") ? "" : (stryCov_9fa48("52863"), 'object'),
      properties: stryMutAct_9fa48("52864") ? {} : (stryCov_9fa48("52864"), {
        defaultReplicaCount: stryMutAct_9fa48("52865") ? {} : (stryCov_9fa48("52865"), {
          type: stryMutAct_9fa48("52866") ? "" : (stryCov_9fa48("52866"), 'number'),
          minimum: 3
        }),
        splitThresholdBytes: stryMutAct_9fa48("52867") ? {} : (stryCov_9fa48("52867"), {
          type: stryMutAct_9fa48("52868") ? "" : (stryCov_9fa48("52868"), 'number'),
          minimum: 1048576
        }),
        splitThresholdQpm: stryMutAct_9fa48("52869") ? {} : (stryCov_9fa48("52869"), {
          type: stryMutAct_9fa48("52870") ? "" : (stryCov_9fa48("52870"), 'number'),
          minimum: 1
        }),
        mergeThresholdBytes: stryMutAct_9fa48("52871") ? {} : (stryCov_9fa48("52871"), {
          type: stryMutAct_9fa48("52872") ? "" : (stryCov_9fa48("52872"), 'number'),
          minimum: 1048576
        }),
        mergeThresholdQpm: stryMutAct_9fa48("52873") ? {} : (stryCov_9fa48("52873"), {
          type: stryMutAct_9fa48("52874") ? "" : (stryCov_9fa48("52874"), 'number'),
          minimum: 1
        }),
        evaluationIntervalMs: stryMutAct_9fa48("52875") ? {} : (stryCov_9fa48("52875"), {
          type: stryMutAct_9fa48("52876") ? "" : (stryCov_9fa48("52876"), 'number'),
          minimum: 60000
        }),
        sizeUpdateDebounceMs: stryMutAct_9fa48("52877") ? {} : (stryCov_9fa48("52877"), {
          type: stryMutAct_9fa48("52878") ? "" : (stryCov_9fa48("52878"), 'number'),
          minimum: 1000
        }),
        sizeUpdateIntervalMs: stryMutAct_9fa48("52879") ? {} : (stryCov_9fa48("52879"), {
          type: stryMutAct_9fa48("52880") ? "" : (stryCov_9fa48("52880"), 'number'),
          minimum: 10000
        })
      }),
      additionalProperties: stryMutAct_9fa48("52881") ? true : (stryCov_9fa48("52881"), false)
    }),
    logging: stryMutAct_9fa48("52882") ? {} : (stryCov_9fa48("52882"), {
      type: stryMutAct_9fa48("52883") ? "" : (stryCov_9fa48("52883"), 'object'),
      properties: stryMutAct_9fa48("52884") ? {} : (stryCov_9fa48("52884"), {
        level: stryMutAct_9fa48("52885") ? {} : (stryCov_9fa48("52885"), {
          type: stryMutAct_9fa48("52886") ? "" : (stryCov_9fa48("52886"), 'string'),
          enum: stryMutAct_9fa48("52887") ? [] : (stryCov_9fa48("52887"), [stryMutAct_9fa48("52888") ? "" : (stryCov_9fa48("52888"), 'trace'), stryMutAct_9fa48("52889") ? "" : (stryCov_9fa48("52889"), 'debug'), stryMutAct_9fa48("52890") ? "" : (stryCov_9fa48("52890"), 'info'), stryMutAct_9fa48("52891") ? "" : (stryCov_9fa48("52891"), 'warn'), stryMutAct_9fa48("52892") ? "" : (stryCov_9fa48("52892"), 'error'), stryMutAct_9fa48("52893") ? "" : (stryCov_9fa48("52893"), 'fatal')])
        }),
        prettyPrint: stryMutAct_9fa48("52894") ? {} : (stryCov_9fa48("52894"), {
          type: stryMutAct_9fa48("52895") ? "" : (stryCov_9fa48("52895"), 'boolean')
        }),
        bufferSize: stryMutAct_9fa48("52896") ? {} : (stryCov_9fa48("52896"), {
          type: stryMutAct_9fa48("52897") ? "" : (stryCov_9fa48("52897"), 'number'),
          minimum: 1
        }),
        flushIntervalMs: stryMutAct_9fa48("52898") ? {} : (stryCov_9fa48("52898"), {
          type: stryMutAct_9fa48("52899") ? "" : (stryCov_9fa48("52899"), 'number'),
          minimum: 100
        }),
        retentionDays: stryMutAct_9fa48("52900") ? {} : (stryCov_9fa48("52900"), {
          type: stryMutAct_9fa48("52901") ? "" : (stryCov_9fa48("52901"), 'number'),
          minimum: 1
        }),
        persistMetricsLogs: stryMutAct_9fa48("52902") ? {} : (stryCov_9fa48("52902"), {
          type: stryMutAct_9fa48("52903") ? "" : (stryCov_9fa48("52903"), 'boolean')
        }),
        metricsDefaultResolutionMs: stryMutAct_9fa48("52904") ? {} : (stryCov_9fa48("52904"), {
          type: stryMutAct_9fa48("52905") ? "" : (stryCov_9fa48("52905"), 'number'),
          minimum: 0
        }),
        metricsDetailedWindowEnabled: stryMutAct_9fa48("52906") ? {} : (stryCov_9fa48("52906"), {
          type: stryMutAct_9fa48("52907") ? "" : (stryCov_9fa48("52907"), 'boolean')
        }),
        metricsDetailedWindowTtlMs: stryMutAct_9fa48("52908") ? {} : (stryCov_9fa48("52908"), {
          type: stryMutAct_9fa48("52909") ? "" : (stryCov_9fa48("52909"), 'number'),
          minimum: 1000
        }),
        maxFileSizeBytes: stryMutAct_9fa48("52910") ? {} : (stryCov_9fa48("52910"), {
          type: stryMutAct_9fa48("52911") ? "" : (stryCov_9fa48("52911"), 'number'),
          minimum: 1048576
        })
      }),
      additionalProperties: stryMutAct_9fa48("52912") ? true : (stryCov_9fa48("52912"), false)
    }),
    transport: stryMutAct_9fa48("52913") ? {} : (stryCov_9fa48("52913"), {
      type: stryMutAct_9fa48("52914") ? "" : (stryCov_9fa48("52914"), 'object'),
      properties: stryMutAct_9fa48("52915") ? {} : (stryCov_9fa48("52915"), {
        wsHost: stryMutAct_9fa48("52916") ? {} : (stryCov_9fa48("52916"), {
          type: stryMutAct_9fa48("52917") ? [] : (stryCov_9fa48("52917"), [stryMutAct_9fa48("52918") ? "" : (stryCov_9fa48("52918"), 'string'), stryMutAct_9fa48("52919") ? "" : (stryCov_9fa48("52919"), 'null')])
        }),
        messageTimeoutMs: stryMutAct_9fa48("52920") ? {} : (stryCov_9fa48("52920"), {
          type: stryMutAct_9fa48("52921") ? "" : (stryCov_9fa48("52921"), 'number'),
          minimum: 100
        }),
        ackTimeoutQuarantineThreshold: stryMutAct_9fa48("52922") ? {} : (stryCov_9fa48("52922"), {
          type: stryMutAct_9fa48("52923") ? "" : (stryCov_9fa48("52923"), 'number'),
          minimum: 1
        }),
        pingTimeoutMs: stryMutAct_9fa48("52924") ? {} : (stryCov_9fa48("52924"), {
          type: stryMutAct_9fa48("52925") ? "" : (stryCov_9fa48("52925"), 'number'),
          minimum: 100
        }),
        reconnectIntervalMs: stryMutAct_9fa48("52926") ? {} : (stryCov_9fa48("52926"), {
          type: stryMutAct_9fa48("52927") ? "" : (stryCov_9fa48("52927"), 'number'),
          minimum: 100
        }),
        reconnectMaxAttempts: stryMutAct_9fa48("52928") ? {} : (stryCov_9fa48("52928"), {
          type: stryMutAct_9fa48("52929") ? "" : (stryCov_9fa48("52929"), 'number'),
          minimum: 1
        }),
        pingIntervalMs: stryMutAct_9fa48("52930") ? {} : (stryCov_9fa48("52930"), {
          type: stryMutAct_9fa48("52931") ? "" : (stryCov_9fa48("52931"), 'number'),
          minimum: 100
        }),
        reconnectBackoffMultiplier: stryMutAct_9fa48("52932") ? {} : (stryCov_9fa48("52932"), {
          type: stryMutAct_9fa48("52933") ? "" : (stryCov_9fa48("52933"), 'number'),
          minimum: 1
        }),
        outboundQueueMaxConcurrent: stryMutAct_9fa48("52934") ? {} : (stryCov_9fa48("52934"), {
          type: stryMutAct_9fa48("52935") ? "" : (stryCov_9fa48("52935"), 'number'),
          minimum: 1
        }),
        connectionPoolTtlMs: stryMutAct_9fa48("52936") ? {} : (stryCov_9fa48("52936"), {
          type: stryMutAct_9fa48("52937") ? "" : (stryCov_9fa48("52937"), 'number'),
          minimum: 1000
        }),
        connectionPoolCleanupIntervalMs: stryMutAct_9fa48("52938") ? {} : (stryCov_9fa48("52938"), {
          type: stryMutAct_9fa48("52939") ? "" : (stryCov_9fa48("52939"), 'number'),
          minimum: 1000
        })
      }),
      additionalProperties: stryMutAct_9fa48("52940") ? true : (stryCov_9fa48("52940"), false)
    }),
    timeout: stryMutAct_9fa48("52941") ? {} : (stryCov_9fa48("52941"), {
      type: stryMutAct_9fa48("52942") ? "" : (stryCov_9fa48("52942"), 'object'),
      properties: stryMutAct_9fa48("52943") ? {} : (stryCov_9fa48("52943"), {
        bootstrapTotalMs: stryMutAct_9fa48("52944") ? {} : (stryCov_9fa48("52944"), {
          type: stryMutAct_9fa48("52945") ? "" : (stryCov_9fa48("52945"), 'number'),
          minimum: 5000
        }),
        serviceStartMs: stryMutAct_9fa48("52946") ? {} : (stryCov_9fa48("52946"), {
          type: stryMutAct_9fa48("52947") ? "" : (stryCov_9fa48("52947"), 'number'),
          minimum: 1000
        }),
        serviceStopMs: stryMutAct_9fa48("52948") ? {} : (stryCov_9fa48("52948"), {
          type: stryMutAct_9fa48("52949") ? "" : (stryCov_9fa48("52949"), 'number'),
          minimum: 1000
        }),
        raftJoinMs: stryMutAct_9fa48("52950") ? {} : (stryCov_9fa48("52950"), {
          type: stryMutAct_9fa48("52951") ? "" : (stryCov_9fa48("52951"), 'number'),
          minimum: 1000
        }),
        queryExecutionMs: stryMutAct_9fa48("52952") ? {} : (stryCov_9fa48("52952"), {
          type: stryMutAct_9fa48("52953") ? "" : (stryCov_9fa48("52953"), 'number'),
          minimum: 1000
        }),
        transactionMs: stryMutAct_9fa48("52954") ? {} : (stryCov_9fa48("52954"), {
          type: stryMutAct_9fa48("52955") ? "" : (stryCov_9fa48("52955"), 'number'),
          minimum: 1000
        }),
        websocketConnectMs: stryMutAct_9fa48("52956") ? {} : (stryCov_9fa48("52956"), {
          type: stryMutAct_9fa48("52957") ? "" : (stryCov_9fa48("52957"), 'number'),
          minimum: 1000
        }),
        httpRequestMs: stryMutAct_9fa48("52958") ? {} : (stryCov_9fa48("52958"), {
          type: stryMutAct_9fa48("52959") ? "" : (stryCov_9fa48("52959"), 'number'),
          minimum: 1000
        })
      }),
      additionalProperties: stryMutAct_9fa48("52960") ? true : (stryCov_9fa48("52960"), false)
    }),
    worker: stryMutAct_9fa48("52961") ? {} : (stryCov_9fa48("52961"), {
      type: stryMutAct_9fa48("52962") ? "" : (stryCov_9fa48("52962"), 'object'),
      properties: stryMutAct_9fa48("52963") ? {} : (stryCov_9fa48("52963"), {
        minThreads: stryMutAct_9fa48("52964") ? {} : (stryCov_9fa48("52964"), {
          type: stryMutAct_9fa48("52965") ? "" : (stryCov_9fa48("52965"), 'number'),
          minimum: 1
        }),
        maxThreads: stryMutAct_9fa48("52966") ? {} : (stryCov_9fa48("52966"), {
          type: stryMutAct_9fa48("52967") ? "" : (stryCov_9fa48("52967"), 'number'),
          minimum: 1
        }),
        idleTimeoutMs: stryMutAct_9fa48("52968") ? {} : (stryCov_9fa48("52968"), {
          type: stryMutAct_9fa48("52969") ? "" : (stryCov_9fa48("52969"), 'number'),
          minimum: 1000
        }),
        taskQueueSize: stryMutAct_9fa48("52970") ? {} : (stryCov_9fa48("52970"), {
          type: stryMutAct_9fa48("52971") ? "" : (stryCov_9fa48("52971"), 'number'),
          minimum: 1
        })
      }),
      additionalProperties: stryMutAct_9fa48("52972") ? true : (stryCov_9fa48("52972"), false)
    }),
    hlc: stryMutAct_9fa48("52973") ? {} : (stryCov_9fa48("52973"), {
      type: stryMutAct_9fa48("52974") ? "" : (stryCov_9fa48("52974"), 'object'),
      properties: stryMutAct_9fa48("52975") ? {} : (stryCov_9fa48("52975"), {
        maxDriftMs: stryMutAct_9fa48("52976") ? {} : (stryCov_9fa48("52976"), {
          type: stryMutAct_9fa48("52977") ? "" : (stryCov_9fa48("52977"), 'number'),
          minimum: 1
        }),
        maxLogicalCounter: stryMutAct_9fa48("52978") ? {} : (stryCov_9fa48("52978"), {
          type: stryMutAct_9fa48("52979") ? "" : (stryCov_9fa48("52979"), 'number'),
          minimum: 1
        }),
        driftCheckIntervalMs: stryMutAct_9fa48("52980") ? {} : (stryCov_9fa48("52980"), {
          type: stryMutAct_9fa48("52981") ? "" : (stryCov_9fa48("52981"), 'number'),
          minimum: 1000
        }),
        syncOnStartup: stryMutAct_9fa48("52982") ? {} : (stryCov_9fa48("52982"), {
          type: stryMutAct_9fa48("52983") ? "" : (stryCov_9fa48("52983"), 'boolean')
        })
      }),
      additionalProperties: stryMutAct_9fa48("52984") ? true : (stryCov_9fa48("52984"), false)
    }),
    rebalancer: stryMutAct_9fa48("52985") ? {} : (stryCov_9fa48("52985"), {
      type: stryMutAct_9fa48("52986") ? "" : (stryCov_9fa48("52986"), 'object'),
      properties: stryMutAct_9fa48("52987") ? {} : (stryCov_9fa48("52987"), {
        periodicCheckIntervalMs: stryMutAct_9fa48("52988") ? {} : (stryCov_9fa48("52988"), {
          type: stryMutAct_9fa48("52989") ? "" : (stryCov_9fa48("52989"), 'number'),
          minimum: 1000
        }),
        periodicCheckJitterMs: stryMutAct_9fa48("52990") ? {} : (stryCov_9fa48("52990"), {
          type: stryMutAct_9fa48("52991") ? "" : (stryCov_9fa48("52991"), 'number'),
          minimum: 100
        }),
        criticalCheckDelayMs: stryMutAct_9fa48("52992") ? {} : (stryCov_9fa48("52992"), {
          type: stryMutAct_9fa48("52993") ? "" : (stryCov_9fa48("52993"), 'number'),
          minimum: 100
        }),
        maxConcurrentMoves: stryMutAct_9fa48("52994") ? {} : (stryCov_9fa48("52994"), {
          type: stryMutAct_9fa48("52995") ? "" : (stryCov_9fa48("52995"), 'number'),
          minimum: 1
        }),
        moveTimeoutMs: stryMutAct_9fa48("52996") ? {} : (stryCov_9fa48("52996"), {
          type: stryMutAct_9fa48("52997") ? "" : (stryCov_9fa48("52997"), 'number'),
          minimum: 10000
        }),
        nodeCpuThreshold: stryMutAct_9fa48("52998") ? {} : (stryCov_9fa48("52998"), {
          type: stryMutAct_9fa48("52999") ? "" : (stryCov_9fa48("52999"), 'number'),
          minimum: 0,
          maximum: 1
        }),
        nodeMemoryThreshold: stryMutAct_9fa48("53000") ? {} : (stryCov_9fa48("53000"), {
          type: stryMutAct_9fa48("53001") ? "" : (stryCov_9fa48("53001"), 'number'),
          minimum: 0,
          maximum: 1
        }),
        nodeDiskThreshold: stryMutAct_9fa48("53002") ? {} : (stryCov_9fa48("53002"), {
          type: stryMutAct_9fa48("53003") ? "" : (stryCov_9fa48("53003"), 'number'),
          minimum: 0,
          maximum: 1
        }),
        stabilizationPeriodMs: stryMutAct_9fa48("53004") ? {} : (stryCov_9fa48("53004"), {
          type: stryMutAct_9fa48("53005") ? "" : (stryCov_9fa48("53005"), 'number'),
          minimum: 1000,
          maximum: 10000
        }),
        systemPartitionStartDelayMs: stryMutAct_9fa48("53006") ? {} : (stryCov_9fa48("53006"), {
          type: stryMutAct_9fa48("53007") ? "" : (stryCov_9fa48("53007"), 'number'),
          minimum: 0
        }),
        userPartitionStartDelayMs: stryMutAct_9fa48("53008") ? {} : (stryCov_9fa48("53008"), {
          type: stryMutAct_9fa48("53009") ? "" : (stryCov_9fa48("53009"), 'number'),
          minimum: 0
        }),
        storageSoftPressurePercent: stryMutAct_9fa48("53010") ? {} : (stryCov_9fa48("53010"), {
          type: stryMutAct_9fa48("53011") ? "" : (stryCov_9fa48("53011"), 'number'),
          minimum: 1,
          maximum: 100
        }),
        storageHardPressurePercent: stryMutAct_9fa48("53012") ? {} : (stryCov_9fa48("53012"), {
          type: stryMutAct_9fa48("53013") ? "" : (stryCov_9fa48("53013"), 'number'),
          minimum: 1,
          maximum: 100
        }),
        storageReservationTtlMs: stryMutAct_9fa48("53014") ? {} : (stryCov_9fa48("53014"), {
          type: stryMutAct_9fa48("53015") ? "" : (stryCov_9fa48("53015"), 'number'),
          minimum: 1000
        }),
        storageEmergencyHeadroomPercent: stryMutAct_9fa48("53016") ? {} : (stryCov_9fa48("53016"), {
          type: stryMutAct_9fa48("53017") ? "" : (stryCov_9fa48("53017"), 'number'),
          minimum: 0,
          maximum: 100
        }),
        minimumReplicaBytes: stryMutAct_9fa48("53018") ? {} : (stryCov_9fa48("53018"), {
          type: stryMutAct_9fa48("53019") ? "" : (stryCov_9fa48("53019"), 'number'),
          minimum: 1
        }),
        splitAmplificationFactor: stryMutAct_9fa48("53020") ? {} : (stryCov_9fa48("53020"), {
          type: stryMutAct_9fa48("53021") ? "" : (stryCov_9fa48("53021"), 'number'),
          minimum: 1
        }),
        partitionReplicaOverheadBytes: stryMutAct_9fa48("53022") ? {} : (stryCov_9fa48("53022"), {
          type: stryMutAct_9fa48("53023") ? "" : (stryCov_9fa48("53023"), 'number'),
          minimum: 0
        }),
        messageGroupReplicaOverheadBytes: stryMutAct_9fa48("53024") ? {} : (stryCov_9fa48("53024"), {
          type: stryMutAct_9fa48("53025") ? "" : (stryCov_9fa48("53025"), 'number'),
          minimum: 0
        }),
        serviceReplicaOverheadBytes: stryMutAct_9fa48("53026") ? {} : (stryCov_9fa48("53026"), {
          type: stryMutAct_9fa48("53027") ? "" : (stryCov_9fa48("53027"), 'number'),
          minimum: 0
        }),
        storageAdmissionMode: stryMutAct_9fa48("53028") ? {} : (stryCov_9fa48("53028"), {
          type: stryMutAct_9fa48("53029") ? "" : (stryCov_9fa48("53029"), 'string'),
          enum: stryMutAct_9fa48("53030") ? [] : (stryCov_9fa48("53030"), [stryMutAct_9fa48("53031") ? "" : (stryCov_9fa48("53031"), 'observe'), stryMutAct_9fa48("53032") ? "" : (stryCov_9fa48("53032"), 'enforce')])
        })
      }),
      additionalProperties: stryMutAct_9fa48("53033") ? true : (stryCov_9fa48("53033"), false)
    }),
    replicaHandler: stryMutAct_9fa48("53034") ? {} : (stryCov_9fa48("53034"), {
      type: stryMutAct_9fa48("53035") ? "" : (stryCov_9fa48("53035"), 'object'),
      properties: stryMutAct_9fa48("53036") ? {} : (stryCov_9fa48("53036"), {
        syncTimeoutMs: stryMutAct_9fa48("53037") ? {} : (stryCov_9fa48("53037"), {
          type: stryMutAct_9fa48("53038") ? "" : (stryCov_9fa48("53038"), 'number'),
          minimum: 100
        })
      }),
      additionalProperties: stryMutAct_9fa48("53039") ? true : (stryCov_9fa48("53039"), false)
    }),
    queryCoordinator: stryMutAct_9fa48("53040") ? {} : (stryCov_9fa48("53040"), {
      type: stryMutAct_9fa48("53041") ? "" : (stryCov_9fa48("53041"), 'object'),
      properties: stryMutAct_9fa48("53042") ? {} : (stryCov_9fa48("53042"), {
        maxParallelPartitions: stryMutAct_9fa48("53043") ? {} : (stryCov_9fa48("53043"), {
          type: stryMutAct_9fa48("53044") ? "" : (stryCov_9fa48("53044"), 'number'),
          minimum: 1,
          maximum: 10000
        }),
        maxConcurrentConnections: stryMutAct_9fa48("53045") ? {} : (stryCov_9fa48("53045"), {
          type: stryMutAct_9fa48("53046") ? "" : (stryCov_9fa48("53046"), 'number'),
          minimum: 1,
          maximum: 10000
        }),
        maxResultBufferBytes: stryMutAct_9fa48("53047") ? {} : (stryCov_9fa48("53047"), {
          type: stryMutAct_9fa48("53048") ? "" : (stryCov_9fa48("53048"), 'number'),
          minimum: 1048576
        }),
        queryTimeoutMs: stryMutAct_9fa48("53049") ? {} : (stryCov_9fa48("53049"), {
          type: stryMutAct_9fa48("53050") ? "" : (stryCov_9fa48("53050"), 'number'),
          minimum: 1000
        }),
        stragglerThresholdMultiplier: stryMutAct_9fa48("53051") ? {} : (stryCov_9fa48("53051"), {
          type: stryMutAct_9fa48("53052") ? "" : (stryCov_9fa48("53052"), 'number'),
          minimum: 1.5
        }),
        speculativeExecutionEnabled: stryMutAct_9fa48("53053") ? {} : (stryCov_9fa48("53053"), {
          type: stryMutAct_9fa48("53054") ? "" : (stryCov_9fa48("53054"), 'boolean')
        }),
        speculativeExecutionDelayMs: stryMutAct_9fa48("53055") ? {} : (stryCov_9fa48("53055"), {
          type: stryMutAct_9fa48("53056") ? "" : (stryCov_9fa48("53056"), 'number'),
          minimum: 10
        }),
        streamingEnabled: stryMutAct_9fa48("53057") ? {} : (stryCov_9fa48("53057"), {
          type: stryMutAct_9fa48("53058") ? "" : (stryCov_9fa48("53058"), 'boolean')
        }),
        streamingChunkSize: stryMutAct_9fa48("53059") ? {} : (stryCov_9fa48("53059"), {
          type: stryMutAct_9fa48("53060") ? "" : (stryCov_9fa48("53060"), 'number'),
          minimum: 100
        })
      }),
      additionalProperties: stryMutAct_9fa48("53061") ? true : (stryCov_9fa48("53061"), false)
    }),
    storage: stryMutAct_9fa48("53062") ? {} : (stryCov_9fa48("53062"), {
      type: stryMutAct_9fa48("53063") ? "" : (stryCov_9fa48("53063"), 'object'),
      properties: stryMutAct_9fa48("53064") ? {} : (stryCov_9fa48("53064"), {
        dataDir: stryMutAct_9fa48("53065") ? {} : (stryCov_9fa48("53065"), {
          type: stryMutAct_9fa48("53066") ? "" : (stryCov_9fa48("53066"), 'string'),
          minLength: 1
        })
      }),
      additionalProperties: stryMutAct_9fa48("53067") ? true : (stryCov_9fa48("53067"), false)
    }),
    admin: stryMutAct_9fa48("53068") ? {} : (stryCov_9fa48("53068"), {
      type: stryMutAct_9fa48("53069") ? "" : (stryCov_9fa48("53069"), 'object'),
      properties: stryMutAct_9fa48("53070") ? {} : (stryCov_9fa48("53070"), {
        queryTimeoutMs: stryMutAct_9fa48("53071") ? {} : (stryCov_9fa48("53071"), {
          type: stryMutAct_9fa48("53072") ? "" : (stryCov_9fa48("53072"), 'number'),
          minimum: 1000
        }),
        cacheDumpTimeoutMs: stryMutAct_9fa48("53073") ? {} : (stryCov_9fa48("53073"), {
          type: stryMutAct_9fa48("53074") ? "" : (stryCov_9fa48("53074"), 'number'),
          minimum: 1000
        })
      }),
      additionalProperties: stryMutAct_9fa48("53075") ? true : (stryCov_9fa48("53075"), false)
    }),
    latency: stryMutAct_9fa48("53076") ? {} : (stryCov_9fa48("53076"), {
      type: stryMutAct_9fa48("53077") ? "" : (stryCov_9fa48("53077"), 'object'),
      properties: stryMutAct_9fa48("53078") ? {} : (stryCov_9fa48("53078"), {
        groupThresholdMs: stryMutAct_9fa48("53079") ? {} : (stryCov_9fa48("53079"), {
          type: stryMutAct_9fa48("53080") ? "" : (stryCov_9fa48("53080"), 'number'),
          minimum: 1
        }),
        recalcIntervalMs: stryMutAct_9fa48("53081") ? {} : (stryCov_9fa48("53081"), {
          type: stryMutAct_9fa48("53082") ? "" : (stryCov_9fa48("53082"), 'number'),
          minimum: 1000
        }),
        recalcJitterRatio: stryMutAct_9fa48("53083") ? {} : (stryCov_9fa48("53083"), {
          type: stryMutAct_9fa48("53084") ? "" : (stryCov_9fa48("53084"), 'number'),
          minimum: 0,
          maximum: 1
        }),
        pingTimeoutMs: stryMutAct_9fa48("53085") ? {} : (stryCov_9fa48("53085"), {
          type: stryMutAct_9fa48("53086") ? "" : (stryCov_9fa48("53086"), 'number'),
          minimum: 1
        }),
        pingRetryCount: stryMutAct_9fa48("53087") ? {} : (stryCov_9fa48("53087"), {
          type: stryMutAct_9fa48("53088") ? "" : (stryCov_9fa48("53088"), 'number'),
          minimum: 0
        }),
        smoothingAlpha: stryMutAct_9fa48("53089") ? {} : (stryCov_9fa48("53089"), {
          type: stryMutAct_9fa48("53090") ? "" : (stryCov_9fa48("53090"), 'number'),
          minimum: 0.01,
          maximum: 1
        }),
        propagationMode: stryMutAct_9fa48("53091") ? {} : (stryCov_9fa48("53091"), {
          type: stryMutAct_9fa48("53092") ? "" : (stryCov_9fa48("53092"), 'string'),
          enum: Object.values(LATENCY_PROPAGATION_MODE)
        })
      }),
      additionalProperties: stryMutAct_9fa48("53093") ? true : (stryCov_9fa48("53093"), false)
    })
  }),
  required: stryMutAct_9fa48("53094") ? [] : (stryCov_9fa48("53094"), [stryMutAct_9fa48("53095") ? "" : (stryCov_9fa48("53095"), 'node')]),
  additionalProperties: stryMutAct_9fa48("53096") ? true : (stryCov_9fa48("53096"), false)
});

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG = stryMutAct_9fa48("53097") ? {} : (stryCov_9fa48("53097"), {
  node: stryMutAct_9fa48("53098") ? {} : (stryCov_9fa48("53098"), {
    id: STRING.EMPTY,
    address: STRING.EMPTY,
    heartbeatIntervalMs: 1000,
    heartbeatTimeoutMs: 5000,
    statsCollectionIntervalMs: 10000,
    maxServicesPerNode: 100,
    restApiPort: 8080,
    seedNodeAddress: STRING.EMPTY
  }),
  raft: stryMutAct_9fa48("53099") ? {} : (stryCov_9fa48("53099"), {
    // Wider election window reduces split-vote churn in small/developing clusters.
    electionTimeoutMinMs: 1000,
    electionTimeoutMaxMs: 3000,
    heartbeatIntervalMs: 50,
    tickIntervalMs: 20,
    adaptiveTimingEnabled: stryMutAct_9fa48("53100") ? true : (stryCov_9fa48("53100"), false),
    adaptiveTimingSampleIntervalMs: 5000,
    adaptiveTimingPromoteSamples: 2,
    adaptiveTimingDemoteSamples: 6,
    adaptiveTimingHighCpuPercent: 2,
    adaptiveTimingLowCpuPercent: 0.8,
    adaptiveTimingHighWriteBytesPerSec: 262144,
    adaptiveTimingLowWriteBytesPerSec: 65536,
    adaptiveTimingHighRssGrowthBytesPerMin: 10485760,
    adaptiveTimingLowRssGrowthBytesPerMin: 2097152,
    adaptiveTimingActiveHeartbeatIntervalMs: 50,
    adaptiveTimingActiveElectionTimeoutMinMs: 1000,
    adaptiveTimingActiveElectionTimeoutMaxMs: 3000,
    adaptiveTimingIdleHeartbeatIntervalMs: 150,
    adaptiveTimingIdleElectionTimeoutMinMs: 3000,
    adaptiveTimingIdleElectionTimeoutMaxMs: 5000,
    leaderActivationStabilizationMs: 250,
    leaderActivationNodeSpacingMs: 25,
    snapshotThreshold: 10000,
    maxLogEntriesPerAppend: 100,
    leadershipWaitTimeoutMs: 30000,
    leadershipWaitBackoffMs: 100
  }),
  messageGroup: stryMutAct_9fa48("53101") ? {} : (stryCov_9fa48("53101"), {
    replicaCount: 3,
    deliveryTimeoutMs: 5000,
    retryMaxAttempts: 3,
    retryInitialDelayMs: 100,
    retryBackoffMultiplier: 2,
    retryMaxDelayMs: 10000,
    retryJitterFactor: 0.1,
    cdcBufferSize: 100,
    cdcFlushIntervalMs: 1000,
    cacheTtlMs: 30000
  }),
  partition: stryMutAct_9fa48("53102") ? {} : (stryCov_9fa48("53102"), {
    defaultReplicaCount: 3,
    splitThresholdBytes: 10737418240,
    // 10GB
    splitThresholdQpm: 1000,
    mergeThresholdBytes: 2147483648,
    // 2GB
    mergeThresholdQpm: 200,
    evaluationIntervalMs: 300000,
    // 5 minutes
    sizeUpdateDebounceMs: 5000,
    sizeUpdateIntervalMs: 60000
  }),
  logging: stryMutAct_9fa48("53103") ? {} : (stryCov_9fa48("53103"), {
    level: stryMutAct_9fa48("53104") ? "" : (stryCov_9fa48("53104"), 'info'),
    prettyPrint: stryMutAct_9fa48("53105") ? true : (stryCov_9fa48("53105"), false),
    bufferSize: 1000,
    flushIntervalMs: 5000,
    retentionDays: 7,
    persistMetricsLogs: stryMutAct_9fa48("53106") ? true : (stryCov_9fa48("53106"), false),
    metricsDefaultResolutionMs: 30000,
    metricsDetailedWindowEnabled: stryMutAct_9fa48("53107") ? true : (stryCov_9fa48("53107"), false),
    metricsDetailedWindowTtlMs: 300000,
    maxFileSizeBytes: 104857600 // 100MB
  }),
  transport: stryMutAct_9fa48("53108") ? {} : (stryCov_9fa48("53108"), {
    wsHost: null,
    messageTimeoutMs: 5000,
    ackTimeoutQuarantineThreshold: 2,
    pingTimeoutMs: 1000,
    reconnectIntervalMs: 1000,
    reconnectMaxAttempts: 10,
    pingIntervalMs: 30000,
    reconnectBackoffMultiplier: 1.5,
    outboundQueueMaxConcurrent: 32,
    connectionPoolTtlMs: 300000,
    // 5 minutes
    connectionPoolCleanupIntervalMs: 60000 // 1 minute
  }),
  timeout: stryMutAct_9fa48("53109") ? {} : (stryCov_9fa48("53109"), {
    bootstrapTotalMs: 30000,
    serviceStartMs: 10000,
    serviceStopMs: 5000,
    raftJoinMs: 10000,
    queryExecutionMs: 30000,
    transactionMs: 60000,
    websocketConnectMs: 5000,
    httpRequestMs: 10000
  }),
  worker: stryMutAct_9fa48("53110") ? {} : (stryCov_9fa48("53110"), {
    minThreads: 2,
    maxThreads: os.cpus().length,
    idleTimeoutMs: 30000,
    taskQueueSize: 1000
  }),
  hlc: stryMutAct_9fa48("53111") ? {} : (stryCov_9fa48("53111"), {
    maxDriftMs: 500,
    maxLogicalCounter: 65535,
    driftCheckIntervalMs: 60000,
    syncOnStartup: stryMutAct_9fa48("53112") ? false : (stryCov_9fa48("53112"), true)
  }),
  rebalancer: stryMutAct_9fa48("53113") ? {} : (stryCov_9fa48("53113"), {
    periodicCheckIntervalMs: 60000,
    // 60 seconds for calmer steady-state polling
    periodicCheckJitterMs: 10000,
    // ±10 seconds
    criticalCheckDelayMs: 5000,
    // 5 second delay for critical events
    maxConcurrentMoves: 5,
    // Max concurrent replica moves
    moveTimeoutMs: 300000,
    // 5 minutes timeout per move
    nodeCpuThreshold: 0.8,
    // 80% CPU threshold
    nodeMemoryThreshold: 0.8,
    // 80% memory threshold
    nodeDiskThreshold: 0.9,
    // 90% disk threshold
    stabilizationPeriodMs: 1000,
    // 1 second stabilization period (Req 2.1)
    systemPartitionStartDelayMs: 0,
    // system partitions rebalance immediately
    userPartitionStartDelayMs: 0,
    // user partitions can rebalance immediately
    storageSoftPressurePercent: 70,
    storageHardPressurePercent: 85,
    storageReservationTtlMs: 300000,
    // 5 minutes
    storageEmergencyHeadroomPercent: 5,
    minimumReplicaBytes: 1048576,
    // 1 MiB
    splitAmplificationFactor: 2,
    partitionReplicaOverheadBytes: 10485760,
    // 10 MiB
    messageGroupReplicaOverheadBytes: 1048576,
    // 1 MiB
    serviceReplicaOverheadBytes: 5242880,
    // 5 MiB
    storageAdmissionMode: stryMutAct_9fa48("53114") ? "" : (stryCov_9fa48("53114"), 'enforce')
  }),
  replicaHandler: stryMutAct_9fa48("53115") ? {} : (stryCov_9fa48("53115"), {
    syncTimeoutMs: 60000 // 60 seconds to wait for voter-ready activation
  }),
  queryCoordinator: stryMutAct_9fa48("53116") ? {} : (stryCov_9fa48("53116"), {
    maxParallelPartitions: 1000,
    // Max partitions per query (Req 26.2)
    maxConcurrentConnections: 10000,
    // Max concurrent connections (Req 26.8)
    maxResultBufferBytes: 1073741824,
    // 1GB result buffer limit (Req 26.3)
    queryTimeoutMs: 30000,
    // 30 second query timeout (Req 26.12)
    stragglerThresholdMultiplier: 2.0,
    // 2x median latency (Req 26.10)
    speculativeExecutionEnabled: stryMutAct_9fa48("53117") ? false : (stryCov_9fa48("53117"), true),
    // Enable speculative execution (Req 26.11)
    speculativeExecutionDelayMs: 100,
    // Delay before speculative execution
    streamingEnabled: stryMutAct_9fa48("53118") ? false : (stryCov_9fa48("53118"), true),
    // Enable streaming aggregation (Req 26.9)
    streamingChunkSize: 1000 // Rows per streaming chunk
  }),
  storage: stryMutAct_9fa48("53119") ? {} : (stryCov_9fa48("53119"), {
    dataDir: stryMutAct_9fa48("53120") ? "" : (stryCov_9fa48("53120"), './data') // Default data directory (Req 35.3)
  }),
  admin: stryMutAct_9fa48("53121") ? {} : (stryCov_9fa48("53121"), {
    queryTimeoutMs: 30000,
    // Query timeout (30 seconds)
    cacheDumpTimeoutMs: 5000 // Cache dump timeout (5 seconds)
  }),
  latency: stryMutAct_9fa48("53122") ? {} : (stryCov_9fa48("53122"), {
    groupThresholdMs: 100,
    recalcIntervalMs: 60000,
    recalcJitterRatio: 0.1,
    pingTimeoutMs: 1000,
    pingRetryCount: 2,
    smoothingAlpha: 0.3,
    propagationMode: LATENCY_PROPAGATION_MODE.SAFE
  })
});

/**
 * Environment variable mappings.
 * Maps environment variable names to configuration paths.
 */
const ENV_MAPPINGS = stryMutAct_9fa48("53123") ? {} : (stryCov_9fa48("53123"), {
  NODE_ID: CONFIG_KEY.NODE_ID,
  NODE_ADDRESS: CONFIG_KEY.NODE_ADDRESS,
  NODE_ADVERTISED_WS_ADDRESS: CONFIG_KEY.NODE_ADVERTISED_WS_ADDRESS,
  REST_API_PORT: CONFIG_KEY.NODE_REST_API_PORT,
  LOG_LEVEL: CONFIG_KEY.LOGGING_LEVEL,
  LOG_PRETTY_PRINT: CONFIG_KEY.LOGGING_PRETTY_PRINT,
  LOG_PERSIST_METRICS: CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS,
  LOG_METRICS_DEFAULT_RESOLUTION_MS: CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS,
  LOG_METRICS_DETAILED_WINDOW_ENABLED: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED,
  LOG_METRICS_DETAILED_WINDOW_TTL_MS: CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS,
  SEED_NODE_ADDRESS: CONFIG_KEY.NODE_SEED_NODE_ADDRESS,
  TRANSPORT_WS_HOST: stryMutAct_9fa48("53124") ? "" : (stryCov_9fa48("53124"), 'transport.wsHost'),
  RAFT_ELECTION_TIMEOUT_MIN_MS: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
  RAFT_ELECTION_TIMEOUT_MAX_MS: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
  RAFT_HEARTBEAT_INTERVAL_MS: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
  RAFT_TICK_INTERVAL_MS: CONFIG_KEY.RAFT_TICK_INTERVAL_MS,
  REBALANCER_PERIODIC_CHECK_INTERVAL_MS: CONFIG_KEY.REBALANCER_PERIODIC_CHECK_INTERVAL_MS,
  REBALANCER_MAX_CONCURRENT_MOVES: CONFIG_KEY.REBALANCER_MAX_CONCURRENT_MOVES,
  REBALANCER_SYSTEM_PARTITION_START_DELAY_MS: CONFIG_KEY.REBALANCER_SYSTEM_PARTITION_START_DELAY_MS,
  REBALANCER_USER_PARTITION_START_DELAY_MS: CONFIG_KEY.REBALANCER_USER_PARTITION_START_DELAY_MS,
  MESSAGE_GROUP_REPLICA_COUNT: CONFIG_KEY.MESSAGE_GROUP_REPLICA_COUNT,
  PARTITION_DEFAULT_REPLICA_COUNT: CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT,
  PARTITION_SPLIT_THRESHOLD_BYTES: CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_BYTES,
  PARTITION_SPLIT_THRESHOLD_QPM: CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_QPM,
  PARTITION_MERGE_THRESHOLD_BYTES: CONFIG_KEY.PARTITION_MERGE_THRESHOLD_BYTES,
  PARTITION_MERGE_THRESHOLD_QPM: CONFIG_KEY.PARTITION_MERGE_THRESHOLD_QPM,
  PARTITION_EVALUATION_INTERVAL_MS: CONFIG_KEY.PARTITION_EVALUATION_INTERVAL_MS,
  WORKER_MIN_THREADS: CONFIG_KEY.WORKER_MIN_THREADS,
  WORKER_MAX_THREADS: CONFIG_KEY.WORKER_MAX_THREADS,
  DATA_DIR: CONFIG_KEY.STORAGE_DATA_DIR
});

/**
 * Default configuration definitions with metadata.
 * Each entry defines the key, default value, type, and whether restart is required.
 */
const CONFIG_DEFINITIONS = stryMutAct_9fa48("53125") ? {} : (stryCov_9fa48("53125"), {
  // Node configuration
  [CONFIG_KEY.NODE_HEARTBEAT_INTERVAL_MS]: stryMutAct_9fa48("53126") ? {} : (stryCov_9fa48("53126"), {
    defaultValue: DEFAULT_CONFIG.node.heartbeatIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53127") ? true : (stryCov_9fa48("53127"), false),
    description: stryMutAct_9fa48("53128") ? "" : (stryCov_9fa48("53128"), 'Interval between node heartbeats in milliseconds')
  }),
  [CONFIG_KEY.NODE_HEARTBEAT_TIMEOUT_MS]: stryMutAct_9fa48("53129") ? {} : (stryCov_9fa48("53129"), {
    defaultValue: DEFAULT_CONFIG.node.heartbeatTimeoutMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53130") ? true : (stryCov_9fa48("53130"), false),
    description: stryMutAct_9fa48("53131") ? "" : (stryCov_9fa48("53131"), 'Timeout for node heartbeat detection in milliseconds')
  }),
  [CONFIG_KEY.NODE_STATS_COLLECTION_INTERVAL_MS]: stryMutAct_9fa48("53132") ? {} : (stryCov_9fa48("53132"), {
    defaultValue: DEFAULT_CONFIG.node.statsCollectionIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53133") ? true : (stryCov_9fa48("53133"), false),
    description: stryMutAct_9fa48("53134") ? "" : (stryCov_9fa48("53134"), 'Interval for collecting node statistics in milliseconds')
  }),
  [CONFIG_KEY.NODE_MAX_SERVICES_PER_NODE]: stryMutAct_9fa48("53135") ? {} : (stryCov_9fa48("53135"), {
    defaultValue: DEFAULT_CONFIG.node.maxServicesPerNode,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53136") ? false : (stryCov_9fa48("53136"), true),
    description: stryMutAct_9fa48("53137") ? "" : (stryCov_9fa48("53137"), 'Maximum number of services per node')
  }),
  [CONFIG_KEY.NODE_REST_API_PORT]: stryMutAct_9fa48("53138") ? {} : (stryCov_9fa48("53138"), {
    defaultValue: DEFAULT_CONFIG.node.restApiPort,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53139") ? false : (stryCov_9fa48("53139"), true),
    description: stryMutAct_9fa48("53140") ? "" : (stryCov_9fa48("53140"), 'REST API port for node service')
  }),
  // Raft configuration
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: stryMutAct_9fa48("53141") ? {} : (stryCov_9fa48("53141"), {
    defaultValue: DEFAULT_CONFIG.raft.electionTimeoutMinMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53142") ? true : (stryCov_9fa48("53142"), false),
    description: stryMutAct_9fa48("53143") ? "" : (stryCov_9fa48("53143"), 'Minimum election timeout in milliseconds')
  }),
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: stryMutAct_9fa48("53144") ? {} : (stryCov_9fa48("53144"), {
    defaultValue: DEFAULT_CONFIG.raft.electionTimeoutMaxMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53145") ? true : (stryCov_9fa48("53145"), false),
    description: stryMutAct_9fa48("53146") ? "" : (stryCov_9fa48("53146"), 'Maximum election timeout in milliseconds')
  }),
  [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: stryMutAct_9fa48("53147") ? {} : (stryCov_9fa48("53147"), {
    defaultValue: DEFAULT_CONFIG.raft.heartbeatIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53148") ? true : (stryCov_9fa48("53148"), false),
    description: stryMutAct_9fa48("53149") ? "" : (stryCov_9fa48("53149"), 'Raft heartbeat interval in milliseconds')
  }),
  [CONFIG_KEY.RAFT_TICK_INTERVAL_MS]: stryMutAct_9fa48("53150") ? {} : (stryCov_9fa48("53150"), {
    defaultValue: DEFAULT_CONFIG.raft.tickIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53151") ? true : (stryCov_9fa48("53151"), false),
    description: stryMutAct_9fa48("53152") ? "" : (stryCov_9fa48("53152"), 'Raft provider tick interval in milliseconds')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED]: stryMutAct_9fa48("53153") ? {} : (stryCov_9fa48("53153"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingEnabled,
    type: CONFIG_VALUE_TYPE.BOOLEAN,
    requiresRestart: stryMutAct_9fa48("53154") ? true : (stryCov_9fa48("53154"), false),
    description: stryMutAct_9fa48("53155") ? "" : (stryCov_9fa48("53155"), 'Enable adaptive raft timing based on observed node load')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_SAMPLE_INTERVAL_MS]: stryMutAct_9fa48("53156") ? {} : (stryCov_9fa48("53156"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingSampleIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53157") ? true : (stryCov_9fa48("53157"), false),
    description: stryMutAct_9fa48("53158") ? "" : (stryCov_9fa48("53158"), 'Adaptive raft timing sampling interval in milliseconds')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_PROMOTE_SAMPLES]: stryMutAct_9fa48("53159") ? {} : (stryCov_9fa48("53159"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingPromoteSamples,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53160") ? true : (stryCov_9fa48("53160"), false),
    description: stryMutAct_9fa48("53161") ? "" : (stryCov_9fa48("53161"), 'Consecutive high-load samples needed to switch to active timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_DEMOTE_SAMPLES]: stryMutAct_9fa48("53162") ? {} : (stryCov_9fa48("53162"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingDemoteSamples,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53163") ? true : (stryCov_9fa48("53163"), false),
    description: stryMutAct_9fa48("53164") ? "" : (stryCov_9fa48("53164"), 'Consecutive low-load samples needed to switch to idle timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_CPU_PERCENT]: stryMutAct_9fa48("53165") ? {} : (stryCov_9fa48("53165"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingHighCpuPercent,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53166") ? true : (stryCov_9fa48("53166"), false),
    description: stryMutAct_9fa48("53167") ? "" : (stryCov_9fa48("53167"), 'High-load CPU threshold for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_CPU_PERCENT]: stryMutAct_9fa48("53168") ? {} : (stryCov_9fa48("53168"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingLowCpuPercent,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53169") ? true : (stryCov_9fa48("53169"), false),
    description: stryMutAct_9fa48("53170") ? "" : (stryCov_9fa48("53170"), 'Low-load CPU threshold for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_WRITE_BYTES_PER_SEC]: stryMutAct_9fa48("53171") ? {} : (stryCov_9fa48("53171"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingHighWriteBytesPerSec,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53172") ? true : (stryCov_9fa48("53172"), false),
    description: stryMutAct_9fa48("53173") ? "" : (stryCov_9fa48("53173"), 'High-load write-rate threshold for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_WRITE_BYTES_PER_SEC]: stryMutAct_9fa48("53174") ? {} : (stryCov_9fa48("53174"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingLowWriteBytesPerSec,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53175") ? true : (stryCov_9fa48("53175"), false),
    description: stryMutAct_9fa48("53176") ? "" : (stryCov_9fa48("53176"), 'Low-load write-rate threshold for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_RSS_GROWTH_BYTES_PER_MIN]: stryMutAct_9fa48("53177") ? {} : (stryCov_9fa48("53177"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingHighRssGrowthBytesPerMin,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53178") ? true : (stryCov_9fa48("53178"), false),
    description: stryMutAct_9fa48("53179") ? "" : (stryCov_9fa48("53179"), 'High-load RSS growth threshold for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_RSS_GROWTH_BYTES_PER_MIN]: stryMutAct_9fa48("53180") ? {} : (stryCov_9fa48("53180"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingLowRssGrowthBytesPerMin,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53181") ? true : (stryCov_9fa48("53181"), false),
    description: stryMutAct_9fa48("53182") ? "" : (stryCov_9fa48("53182"), 'Low-load RSS growth threshold for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_HEARTBEAT_INTERVAL_MS]: stryMutAct_9fa48("53183") ? {} : (stryCov_9fa48("53183"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingActiveHeartbeatIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53184") ? true : (stryCov_9fa48("53184"), false),
    description: stryMutAct_9fa48("53185") ? "" : (stryCov_9fa48("53185"), 'Active-profile heartbeat interval for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MIN_MS]: stryMutAct_9fa48("53186") ? {} : (stryCov_9fa48("53186"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingActiveElectionTimeoutMinMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53187") ? true : (stryCov_9fa48("53187"), false),
    description: stryMutAct_9fa48("53188") ? "" : (stryCov_9fa48("53188"), 'Active-profile minimum election timeout for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MAX_MS]: stryMutAct_9fa48("53189") ? {} : (stryCov_9fa48("53189"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingActiveElectionTimeoutMaxMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53190") ? true : (stryCov_9fa48("53190"), false),
    description: stryMutAct_9fa48("53191") ? "" : (stryCov_9fa48("53191"), 'Active-profile maximum election timeout for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_HEARTBEAT_INTERVAL_MS]: stryMutAct_9fa48("53192") ? {} : (stryCov_9fa48("53192"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingIdleHeartbeatIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53193") ? true : (stryCov_9fa48("53193"), false),
    description: stryMutAct_9fa48("53194") ? "" : (stryCov_9fa48("53194"), 'Idle-profile heartbeat interval for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MIN_MS]: stryMutAct_9fa48("53195") ? {} : (stryCov_9fa48("53195"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingIdleElectionTimeoutMinMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53196") ? true : (stryCov_9fa48("53196"), false),
    description: stryMutAct_9fa48("53197") ? "" : (stryCov_9fa48("53197"), 'Idle-profile minimum election timeout for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MAX_MS]: stryMutAct_9fa48("53198") ? {} : (stryCov_9fa48("53198"), {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingIdleElectionTimeoutMaxMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53199") ? true : (stryCov_9fa48("53199"), false),
    description: stryMutAct_9fa48("53200") ? "" : (stryCov_9fa48("53200"), 'Idle-profile maximum election timeout for adaptive raft timing')
  }),
  [CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS]: stryMutAct_9fa48("53201") ? {} : (stryCov_9fa48("53201"), {
    defaultValue: DEFAULT_CONFIG.raft.leaderActivationStabilizationMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53202") ? true : (stryCov_9fa48("53202"), false),
    description: stryMutAct_9fa48("53203") ? "" : (stryCov_9fa48("53203"), 'Holdoff before leader-owned background work activates after a leader event')
  }),
  [CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS]: stryMutAct_9fa48("53204") ? {} : (stryCov_9fa48("53204"), {
    defaultValue: DEFAULT_CONFIG.raft.leaderActivationNodeSpacingMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53205") ? true : (stryCov_9fa48("53205"), false),
    description: stryMutAct_9fa48("53206") ? "" : (stryCov_9fa48("53206"), 'Minimum spacing between leader-owned activation starts on the same node')
  }),
  // Message group configuration
  [CONFIG_KEY.MESSAGE_GROUP_REPLICA_COUNT]: stryMutAct_9fa48("53207") ? {} : (stryCov_9fa48("53207"), {
    defaultValue: DEFAULT_CONFIG.messageGroup.replicaCount,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53208") ? false : (stryCov_9fa48("53208"), true),
    description: stryMutAct_9fa48("53209") ? "" : (stryCov_9fa48("53209"), 'Default replica count for message groups')
  }),
  [CONFIG_KEY.MESSAGE_GROUP_DELIVERY_TIMEOUT_MS]: stryMutAct_9fa48("53210") ? {} : (stryCov_9fa48("53210"), {
    defaultValue: DEFAULT_CONFIG.messageGroup.deliveryTimeoutMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53211") ? true : (stryCov_9fa48("53211"), false),
    description: stryMutAct_9fa48("53212") ? "" : (stryCov_9fa48("53212"), 'Message delivery timeout in milliseconds')
  }),
  [CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_ATTEMPTS]: stryMutAct_9fa48("53213") ? {} : (stryCov_9fa48("53213"), {
    defaultValue: DEFAULT_CONFIG.messageGroup.retryMaxAttempts,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53214") ? true : (stryCov_9fa48("53214"), false),
    description: stryMutAct_9fa48("53215") ? "" : (stryCov_9fa48("53215"), 'Maximum retry attempts for message delivery')
  }),
  [CONFIG_KEY.MESSAGE_GROUP_CACHE_TTL_MS]: stryMutAct_9fa48("53216") ? {} : (stryCov_9fa48("53216"), {
    defaultValue: DEFAULT_CONFIG.messageGroup.cacheTtlMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53217") ? true : (stryCov_9fa48("53217"), false),
    description: stryMutAct_9fa48("53218") ? "" : (stryCov_9fa48("53218"), 'Cache TTL in milliseconds')
  }),
  // Partition configuration
  [CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT]: stryMutAct_9fa48("53219") ? {} : (stryCov_9fa48("53219"), {
    defaultValue: DEFAULT_CONFIG.partition.defaultReplicaCount,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53220") ? false : (stryCov_9fa48("53220"), true),
    description: stryMutAct_9fa48("53221") ? "" : (stryCov_9fa48("53221"), 'Default replica count for partitions')
  }),
  [CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_BYTES]: stryMutAct_9fa48("53222") ? {} : (stryCov_9fa48("53222"), {
    defaultValue: DEFAULT_CONFIG.partition.splitThresholdBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53223") ? true : (stryCov_9fa48("53223"), false),
    description: stryMutAct_9fa48("53224") ? "" : (stryCov_9fa48("53224"), 'Partition split threshold in bytes')
  }),
  [CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_QPM]: stryMutAct_9fa48("53225") ? {} : (stryCov_9fa48("53225"), {
    defaultValue: DEFAULT_CONFIG.partition.splitThresholdQpm,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53226") ? true : (stryCov_9fa48("53226"), false),
    description: stryMutAct_9fa48("53227") ? "" : (stryCov_9fa48("53227"), 'Partition split threshold in queries per minute')
  }),
  [CONFIG_KEY.PARTITION_MERGE_THRESHOLD_BYTES]: stryMutAct_9fa48("53228") ? {} : (stryCov_9fa48("53228"), {
    defaultValue: DEFAULT_CONFIG.partition.mergeThresholdBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53229") ? true : (stryCov_9fa48("53229"), false),
    description: stryMutAct_9fa48("53230") ? "" : (stryCov_9fa48("53230"), 'Partition merge threshold in bytes')
  }),
  [CONFIG_KEY.PARTITION_MERGE_THRESHOLD_QPM]: stryMutAct_9fa48("53231") ? {} : (stryCov_9fa48("53231"), {
    defaultValue: DEFAULT_CONFIG.partition.mergeThresholdQpm,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53232") ? true : (stryCov_9fa48("53232"), false),
    description: stryMutAct_9fa48("53233") ? "" : (stryCov_9fa48("53233"), 'Partition merge threshold in queries per minute')
  }),
  [CONFIG_KEY.PARTITION_EVALUATION_INTERVAL_MS]: stryMutAct_9fa48("53234") ? {} : (stryCov_9fa48("53234"), {
    defaultValue: DEFAULT_CONFIG.partition.evaluationIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53235") ? true : (stryCov_9fa48("53235"), false),
    description: stryMutAct_9fa48("53236") ? "" : (stryCov_9fa48("53236"), 'Partition evaluation interval in milliseconds')
  }),
  // Logging configuration
  [CONFIG_KEY.LOGGING_LEVEL]: stryMutAct_9fa48("53237") ? {} : (stryCov_9fa48("53237"), {
    defaultValue: DEFAULT_CONFIG.logging.level,
    type: CONFIG_VALUE_TYPE.STRING,
    requiresRestart: stryMutAct_9fa48("53238") ? true : (stryCov_9fa48("53238"), false),
    description: stryMutAct_9fa48("53239") ? "" : (stryCov_9fa48("53239"), 'Log level (trace, debug, info, warn, error, fatal)')
  }),
  [CONFIG_KEY.LOGGING_RETENTION_DAYS]: stryMutAct_9fa48("53240") ? {} : (stryCov_9fa48("53240"), {
    defaultValue: DEFAULT_CONFIG.logging.retentionDays,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53241") ? true : (stryCov_9fa48("53241"), false),
    description: stryMutAct_9fa48("53242") ? "" : (stryCov_9fa48("53242"), 'Log retention period in days')
  }),
  [CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS]: stryMutAct_9fa48("53243") ? {} : (stryCov_9fa48("53243"), {
    defaultValue: DEFAULT_CONFIG.logging.persistMetricsLogs,
    type: CONFIG_VALUE_TYPE.BOOLEAN,
    requiresRestart: stryMutAct_9fa48("53244") ? true : (stryCov_9fa48("53244"), false),
    description: stryMutAct_9fa48("53245") ? "" : (stryCov_9fa48("53245"), 'Persist metrics.* logs into the logs table')
  }),
  [CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS]: stryMutAct_9fa48("53246") ? {} : (stryCov_9fa48("53246"), {
    defaultValue: DEFAULT_CONFIG.logging.metricsDefaultResolutionMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53247") ? true : (stryCov_9fa48("53247"), false),
    description: stryMutAct_9fa48("53248") ? "" : (stryCov_9fa48("53248"), 'Default per-tag metrics sampling resolution in milliseconds')
  }),
  [CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED]: stryMutAct_9fa48("53249") ? {} : (stryCov_9fa48("53249"), {
    defaultValue: DEFAULT_CONFIG.logging.metricsDetailedWindowEnabled,
    type: CONFIG_VALUE_TYPE.BOOLEAN,
    requiresRestart: stryMutAct_9fa48("53250") ? true : (stryCov_9fa48("53250"), false),
    description: stryMutAct_9fa48("53251") ? "" : (stryCov_9fa48("53251"), 'Enable high-detail metrics debug window')
  }),
  [CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS]: stryMutAct_9fa48("53252") ? {} : (stryCov_9fa48("53252"), {
    defaultValue: DEFAULT_CONFIG.logging.metricsDetailedWindowTtlMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53253") ? true : (stryCov_9fa48("53253"), false),
    description: stryMutAct_9fa48("53254") ? "" : (stryCov_9fa48("53254"), 'TTL for high-detail metrics debug window in milliseconds')
  }),
  // Rebalancer configuration
  [CONFIG_KEY.REBALANCER_PERIODIC_CHECK_INTERVAL_MS]: stryMutAct_9fa48("53255") ? {} : (stryCov_9fa48("53255"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.periodicCheckIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53256") ? true : (stryCov_9fa48("53256"), false),
    description: stryMutAct_9fa48("53257") ? "" : (stryCov_9fa48("53257"), 'Rebalancer periodic check interval in milliseconds')
  }),
  [CONFIG_KEY.REBALANCER_MAX_CONCURRENT_MOVES]: stryMutAct_9fa48("53258") ? {} : (stryCov_9fa48("53258"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.maxConcurrentMoves,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53259") ? true : (stryCov_9fa48("53259"), false),
    description: stryMutAct_9fa48("53260") ? "" : (stryCov_9fa48("53260"), 'Maximum concurrent replica moves')
  }),
  [CONFIG_KEY.REBALANCER_SYSTEM_PARTITION_START_DELAY_MS]: stryMutAct_9fa48("53261") ? {} : (stryCov_9fa48("53261"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.systemPartitionStartDelayMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53262") ? true : (stryCov_9fa48("53262"), false),
    description: stryMutAct_9fa48("53263") ? "" : (stryCov_9fa48("53263"), 'Startup delay before rebalancing system table partitions (milliseconds)')
  }),
  [CONFIG_KEY.REBALANCER_USER_PARTITION_START_DELAY_MS]: stryMutAct_9fa48("53264") ? {} : (stryCov_9fa48("53264"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.userPartitionStartDelayMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53265") ? true : (stryCov_9fa48("53265"), false),
    description: stryMutAct_9fa48("53266") ? "" : (stryCov_9fa48("53266"), 'Startup delay before rebalancing non-system partitions (milliseconds)')
  }),
  // Storage capacity rebalancer configuration
  [CONFIG_KEY.REBALANCER_STORAGE_SOFT_PRESSURE_PERCENT]: stryMutAct_9fa48("53267") ? {} : (stryCov_9fa48("53267"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.storageSoftPressurePercent,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53268") ? true : (stryCov_9fa48("53268"), false),
    description: stryMutAct_9fa48("53269") ? "" : (stryCov_9fa48("53269"), 'Budget utilization percent triggering soft pressure state')
  }),
  [CONFIG_KEY.REBALANCER_STORAGE_HARD_PRESSURE_PERCENT]: stryMutAct_9fa48("53270") ? {} : (stryCov_9fa48("53270"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.storageHardPressurePercent,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53271") ? true : (stryCov_9fa48("53271"), false),
    description: stryMutAct_9fa48("53272") ? "" : (stryCov_9fa48("53272"), 'Budget utilization percent triggering hard pressure state')
  }),
  [CONFIG_KEY.REBALANCER_STORAGE_RESERVATION_TTL_MS]: stryMutAct_9fa48("53273") ? {} : (stryCov_9fa48("53273"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.storageReservationTtlMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53274") ? true : (stryCov_9fa48("53274"), false),
    description: stryMutAct_9fa48("53275") ? "" : (stryCov_9fa48("53275"), 'TTL for storage reservations in milliseconds')
  }),
  [CONFIG_KEY.REBALANCER_STORAGE_EMERGENCY_HEADROOM_PERCENT]: stryMutAct_9fa48("53276") ? {} : (stryCov_9fa48("53276"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.storageEmergencyHeadroomPercent,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53277") ? true : (stryCov_9fa48("53277"), false),
    description: stryMutAct_9fa48("53278") ? "" : (stryCov_9fa48("53278"), 'Budget percent reserved for critical correctness operations')
  }),
  [CONFIG_KEY.REBALANCER_MINIMUM_REPLICA_BYTES]: stryMutAct_9fa48("53279") ? {} : (stryCov_9fa48("53279"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.minimumReplicaBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53280") ? true : (stryCov_9fa48("53280"), false),
    description: stryMutAct_9fa48("53281") ? "" : (stryCov_9fa48("53281"), 'Minimum estimated bytes for any replica operation')
  }),
  [CONFIG_KEY.REBALANCER_SPLIT_AMPLIFICATION_FACTOR]: stryMutAct_9fa48("53282") ? {} : (stryCov_9fa48("53282"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.splitAmplificationFactor,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53283") ? true : (stryCov_9fa48("53283"), false),
    description: stryMutAct_9fa48("53284") ? "" : (stryCov_9fa48("53284"), 'Multiplier for split write-amplification reservation estimates')
  }),
  [CONFIG_KEY.REBALANCER_PARTITION_REPLICA_OVERHEAD_BYTES]: stryMutAct_9fa48("53285") ? {} : (stryCov_9fa48("53285"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.partitionReplicaOverheadBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53286") ? true : (stryCov_9fa48("53286"), false),
    description: stryMutAct_9fa48("53287") ? "" : (stryCov_9fa48("53287"), 'Fixed overhead bytes per partition replica')
  }),
  [CONFIG_KEY.REBALANCER_MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES]: stryMutAct_9fa48("53288") ? {} : (stryCov_9fa48("53288"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.messageGroupReplicaOverheadBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53289") ? true : (stryCov_9fa48("53289"), false),
    description: stryMutAct_9fa48("53290") ? "" : (stryCov_9fa48("53290"), 'Fixed overhead bytes per message group replica')
  }),
  [CONFIG_KEY.REBALANCER_SERVICE_REPLICA_OVERHEAD_BYTES]: stryMutAct_9fa48("53291") ? {} : (stryCov_9fa48("53291"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.serviceReplicaOverheadBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53292") ? true : (stryCov_9fa48("53292"), false),
    description: stryMutAct_9fa48("53293") ? "" : (stryCov_9fa48("53293"), 'Fixed overhead bytes per service replica')
  }),
  [CONFIG_KEY.REBALANCER_STORAGE_ADMISSION_MODE]: stryMutAct_9fa48("53294") ? {} : (stryCov_9fa48("53294"), {
    defaultValue: DEFAULT_CONFIG.rebalancer.storageAdmissionMode,
    type: CONFIG_VALUE_TYPE.STRING,
    requiresRestart: stryMutAct_9fa48("53295") ? true : (stryCov_9fa48("53295"), false),
    description: stryMutAct_9fa48("53296") ? "" : (stryCov_9fa48("53296"), 'Storage admission mode: observe (log only) or enforce (block)')
  }),
  // Latency topology configuration
  [CONFIG_KEY.LATENCY_GROUP_THRESHOLD_MS]: stryMutAct_9fa48("53297") ? {} : (stryCov_9fa48("53297"), {
    defaultValue: DEFAULT_CONFIG.latency.groupThresholdMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53298") ? true : (stryCov_9fa48("53298"), false),
    description: stryMutAct_9fa48("53299") ? "" : (stryCov_9fa48("53299"), 'Latency threshold in milliseconds for same-group membership')
  }),
  [CONFIG_KEY.LATENCY_RECALC_INTERVAL_MS]: stryMutAct_9fa48("53300") ? {} : (stryCov_9fa48("53300"), {
    defaultValue: DEFAULT_CONFIG.latency.recalcIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53301") ? true : (stryCov_9fa48("53301"), false),
    description: stryMutAct_9fa48("53302") ? "" : (stryCov_9fa48("53302"), 'Interval between latency group recalculation cycles')
  }),
  [CONFIG_KEY.LATENCY_RECALC_JITTER_RATIO]: stryMutAct_9fa48("53303") ? {} : (stryCov_9fa48("53303"), {
    defaultValue: DEFAULT_CONFIG.latency.recalcJitterRatio,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53304") ? true : (stryCov_9fa48("53304"), false),
    description: stryMutAct_9fa48("53305") ? "" : (stryCov_9fa48("53305"), 'Bounded jitter ratio applied to recalculation scheduling')
  }),
  [CONFIG_KEY.LATENCY_PING_TIMEOUT_MS]: stryMutAct_9fa48("53306") ? {} : (stryCov_9fa48("53306"), {
    defaultValue: DEFAULT_CONFIG.latency.pingTimeoutMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53307") ? true : (stryCov_9fa48("53307"), false),
    description: stryMutAct_9fa48("53308") ? "" : (stryCov_9fa48("53308"), 'Timeout for latency ping measurements in milliseconds')
  }),
  [CONFIG_KEY.LATENCY_PING_RETRY_COUNT]: stryMutAct_9fa48("53309") ? {} : (stryCov_9fa48("53309"), {
    defaultValue: DEFAULT_CONFIG.latency.pingRetryCount,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53310") ? true : (stryCov_9fa48("53310"), false),
    description: stryMutAct_9fa48("53311") ? "" : (stryCov_9fa48("53311"), 'Retry count for latency ping measurements')
  }),
  [CONFIG_KEY.LATENCY_SMOOTHING_ALPHA]: stryMutAct_9fa48("53312") ? {} : (stryCov_9fa48("53312"), {
    defaultValue: DEFAULT_CONFIG.latency.smoothingAlpha,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53313") ? true : (stryCov_9fa48("53313"), false),
    description: stryMutAct_9fa48("53314") ? "" : (stryCov_9fa48("53314"), 'Exponential smoothing alpha for RTT samples')
  }),
  [CONFIG_KEY.LATENCY_PROPAGATION_MODE]: stryMutAct_9fa48("53315") ? {} : (stryCov_9fa48("53315"), {
    defaultValue: DEFAULT_CONFIG.latency.propagationMode,
    type: CONFIG_VALUE_TYPE.STRING,
    requiresRestart: stryMutAct_9fa48("53316") ? true : (stryCov_9fa48("53316"), false),
    description: stryMutAct_9fa48("53317") ? "" : (stryCov_9fa48("53317"), 'Latency-aware CDC propagation mode (safe or grouped)')
  }),
  // Query coordinator configuration
  [CONFIG_KEY.QUERY_COORDINATOR_MAX_PARALLEL_PARTITIONS]: stryMutAct_9fa48("53318") ? {} : (stryCov_9fa48("53318"), {
    defaultValue: DEFAULT_CONFIG.queryCoordinator.maxParallelPartitions,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53319") ? true : (stryCov_9fa48("53319"), false),
    description: stryMutAct_9fa48("53320") ? "" : (stryCov_9fa48("53320"), 'Maximum partitions per parallel query')
  }),
  [CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS]: stryMutAct_9fa48("53321") ? {} : (stryCov_9fa48("53321"), {
    defaultValue: DEFAULT_CONFIG.queryCoordinator.queryTimeoutMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: stryMutAct_9fa48("53322") ? true : (stryCov_9fa48("53322"), false),
    description: stryMutAct_9fa48("53323") ? "" : (stryCov_9fa48("53323"), 'Query timeout in milliseconds')
  }),
  [CONFIG_KEY.QUERY_COORDINATOR_SPECULATIVE_EXECUTION_ENABLED]: stryMutAct_9fa48("53324") ? {} : (stryCov_9fa48("53324"), {
    defaultValue: DEFAULT_CONFIG.queryCoordinator.speculativeExecutionEnabled,
    type: CONFIG_VALUE_TYPE.BOOLEAN,
    requiresRestart: stryMutAct_9fa48("53325") ? true : (stryCov_9fa48("53325"), false),
    description: stryMutAct_9fa48("53326") ? "" : (stryCov_9fa48("53326"), 'Enable speculative execution for slow partitions')
  })
});
const CONFIG_SQL = Object.freeze(stryMutAct_9fa48("53327") ? {} : (stryCov_9fa48("53327"), {
  SELECT_ALL: stryMutAct_9fa48("53328") ? "" : (stryCov_9fa48("53328"), 'SELECT * FROM config'),
  SELECT_BY_KEY: stryMutAct_9fa48("53329") ? "" : (stryCov_9fa48("53329"), 'SELECT * FROM config WHERE config_key = ?')
}));
export { CONFIG_CATEGORY, CONFIG_DEFINITIONS, CONFIG_ENV, CONFIG_ENV_REGEX, CONFIG_ENV_REPLACE, CONFIG_ERROR_MSG, CONFIG_EVENT, CONFIG_KEY, CONFIG_KEY_FRAGMENT, LATENCY_PROPAGATION_MODE, CONFIG_LOG_LEVELS, CONFIG_LOG_MSG, CONFIG_SCHEMA, CONFIG_SEED_SOURCE, CONFIG_SEPARATOR, CONFIG_SQL, CONFIG_STATS_DEFAULT, CONFIG_SUBSYSTEM, CONFIG_TABLE_COLUMN, CONFIG_VALUE_DEFAULT, CONFIG_VALUE_TYPE, DEFAULT_CONFIG, ENV_MAPPINGS, STRING, TYPEOF };