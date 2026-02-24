import {
  NODE_CLIENT_CHANNEL,
  NODE_CLIENT_CONTROL_SNAPSHOT_SCHEMA_VERSION,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_ERROR_CODES,
  NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_TIMEOUT_CLASS,
  resolveNodeClientChannelPolicies,
} from './constants.js';

const ZERO = 0;
const ONE = 1;

const QUERY_WITH_TIMEOUT_METHOD = 'queryWithTimeout';
const GET_REACHABILITY_DIAGNOSTICS_METHOD = 'getReachabilityDiagnostics';
const UNKNOWN_NODE_ID = 'unknown-node';
const ERROR_MESSAGE_UNKNOWN = 'unknown error';
const TIMEOUT_ERROR_CODE = 'ETIMEDOUT';
const TIMEOUT_ERROR_PATTERN = /timeout|timed out|deadline exceeded|etimedout/i;

const OPERATION_QUERY_LOAD = 'queryLoad';
const OPERATION_QUERY_CONTROL = 'queryControl';
const OPERATION_PROBE_READINESS = 'probeReadiness';
const OPERATION_FETCH_CONTROL_SNAPSHOT = 'fetchControlSnapshot';
const OPERATION_FETCH_SERVICE_DISCOVERY = 'fetchServiceDiscovery';
const DEFAULT_PROBE_SCOPE = 'default';
const SNAPSHOT_FIELD_SCHEMA_VERSION = 'schemaVersion';
const SNAPSHOT_FIELD_NODE_ID = 'nodeId';
const SNAPSHOT_FIELD_CAPTURED_AT = 'capturedAt';
const SNAPSHOT_FIELD_NODES = 'nodes';
const SNAPSHOT_FIELD_PARTITIONS = 'partitions';
const SNAPSHOT_FIELD_LEADERS = 'leaders';
const SNAPSHOT_FIELD_REPLICA_OPERATIONS = 'replicaOperations';
const SNAPSHOT_FIELD_IN_FLIGHT_COUNT = 'inFlightCount';
const SNAPSHOT_FIELD_STATUS_HISTOGRAM = 'statusHistogram';
const SNAPSHOT_FIELD_PARTITION_GROUP_IN_FLIGHT = 'partitionGroupInFlight';
const DISCOVERY_FIELD_SCHEMA_VERSION = 'schemaVersion';
const DISCOVERY_FIELD_NODE_ID = 'nodeId';
const DISCOVERY_FIELD_CAPTURED_AT = 'capturedAt';
const DISCOVERY_FIELD_SERVICE_COUNT = 'serviceCount';
const DISCOVERY_FIELD_REPLICA_COUNT = 'replicaCount';
const DISCOVERY_FIELD_SERVICES = 'services';
const DISCOVERY_SERVICE_FIELD_SERVICE_KEY = 'serviceKey';
const DISCOVERY_SERVICE_FIELD_LOGICAL_SERVICE_NAME = 'logicalServiceName';
const DISCOVERY_SERVICE_FIELD_PROTOCOL = 'protocol';
const DISCOVERY_SERVICE_FIELD_SERVICE_IDS = 'serviceIds';
const DISCOVERY_SERVICE_FIELD_NODES = 'nodes';
const DISCOVERY_SERVICE_FIELD_REPLICAS = 'replicas';
const DISCOVERY_REPLICA_FIELD_ENDPOINT_ID = 'endpointId';
const DISCOVERY_REPLICA_FIELD_SERVICE_ID = 'serviceId';
const DISCOVERY_REPLICA_FIELD_NODE_ID = 'nodeId';
const DISCOVERY_REPLICA_FIELD_ADDRESS = 'address';
const DISCOVERY_REPLICA_FIELD_PORT = 'port';
const DISCOVERY_REPLICA_FIELD_HEALTH_STATUS = 'healthStatus';
const DISCOVERY_REPLICA_FIELD_UPDATED_AT = 'updatedAt';
const DISCOVERY_REPLICA_FIELD_METADATA = 'metadata';
const DISCOVERY_REPLICA_FIELD_READINESS = 'readiness';
const DISCOVERY_READINESS_FIELD_WORKLOAD_READY = 'workloadReady';
const DISCOVERY_READINESS_FIELD_ROUTING_READY = 'routingReady';
const DISCOVERY_READINESS_FIELD_SCHEMA_READY = 'schemaReady';
const DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT = 'replicaOpsInFlight';
const DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE = 'leadershipStable';
const DISCOVERY_READINESS_FIELD_REASONS = 'reasons';
const DISCOVERY_READINESS_FIELD_TABLE_NAME = 'tableName';
const DISCOVERY_READINESS_REASON_FIELD_CODE = 'code';
const DISCOVERY_READINESS_REASON_FIELD_DETAIL = 'detail';
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DISCOVERY_SQL_PREFIX = 'SELECT * FROM service_discovery_local(';
const DISCOVERY_SQL_SUFFIX = ')';

const NODE_CLIENT_METRIC_KEY_REQUESTS = 'requests';
const NODE_CLIENT_METRIC_KEY_SUCCESSES = 'successes';
const NODE_CLIENT_METRIC_KEY_ERRORS = 'errors';
const NODE_CLIENT_METRIC_KEY_TIMEOUTS = 'timeouts';
const NODE_CLIENT_METRIC_KEY_RETRIES = 'retries';
const NODE_CLIENT_METRIC_KEY_BREAKER_OPENS = 'breakerOpens';
const NODE_CLIENT_METRIC_KEY_BUDGET_DENIALS = 'budgetDenials';
const NODE_CLIENT_METRIC_KEY_TIMEOUT_BUDGET_MISMATCHES =
  'timeoutBudgetMismatches';
const NODE_CLIENT_METRIC_KEY_TIMED_OUT_IN_FLIGHT = 'timedOutInFlight';

const NODE_CLIENT_METRIC_KEYS = Object.freeze([
  NODE_CLIENT_METRIC_KEY_REQUESTS,
  NODE_CLIENT_METRIC_KEY_SUCCESSES,
  NODE_CLIENT_METRIC_KEY_ERRORS,
  NODE_CLIENT_METRIC_KEY_TIMEOUTS,
  NODE_CLIENT_METRIC_KEY_RETRIES,
  NODE_CLIENT_METRIC_KEY_BREAKER_OPENS,
  NODE_CLIENT_METRIC_KEY_BUDGET_DENIALS,
  NODE_CLIENT_METRIC_KEY_TIMEOUT_BUDGET_MISMATCHES,
  NODE_CLIENT_METRIC_KEY_TIMED_OUT_IN_FLIGHT,
]);

/**
 * Error raised by NodeClient with channel + operation context.
 */
class NodeClientError extends Error {
  constructor(options = {}) {
    super(options.message, {
      cause: options.cause,
    });
    this.name = 'NodeClientError';
    this.code = options.code || NODE_CLIENT_ERROR_CODES.OPERATION;
    this.nodeId = options.nodeId || UNKNOWN_NODE_ID;
    this.channel = options.channel || NODE_CLIENT_CHANNEL.CONTROL;
    this.operation = options.operation || OPERATION_QUERY_CONTROL;
    this.timeoutClass =
      options.timeoutClass || NODE_CLIENT_TIMEOUT_CLASS.NON_TIMEOUT;
  }
}

function normalizeNodeId(node) {
  if (typeof node?.id === 'string' && node.id.length > ZERO) {
    return node.id;
  }
  return UNKNOWN_NODE_ID;
}

function normalizeErrorMessage(error) {
  if (typeof error?.message === 'string' && error.message.length > ZERO) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > ZERO) {
    return error;
  }
  return ERROR_MESSAGE_UNKNOWN;
}

function classifyTimeoutClass(error) {
  if (error instanceof NodeClientError) {
    return error.timeoutClass;
  }
  const message = normalizeErrorMessage(error);
  if (TIMEOUT_ERROR_PATTERN.test(message)) {
    return NODE_CLIENT_TIMEOUT_CLASS.TIMEOUT;
  }
  const code = String(error?.code || '').toUpperCase();
  if (code === TIMEOUT_ERROR_CODE) {
    return NODE_CLIENT_TIMEOUT_CLASS.TIMEOUT;
  }
  return NODE_CLIENT_TIMEOUT_CLASS.NON_TIMEOUT;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const boundedTimeoutMs = Math.max(ONE, Number(timeoutMs) || ZERO);
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(timeoutMessage));
    }, boundedTimeoutMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    Promise.resolve(promise)
      .then((result) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

function resolveOperationTimeoutMs(context, fallbackTimeoutMs) {
  const contextTimeoutMs = Number(context?.timeoutMs);
  if (Number.isFinite(contextTimeoutMs) && contextTimeoutMs > ZERO) {
    return Math.floor(contextTimeoutMs);
  }
  return fallbackTimeoutMs;
}

function normalizeIdentifier(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmedValue = value.trim();
  if (!IDENTIFIER_PATTERN.test(trimmedValue)) {
    return null;
  }
  return trimmedValue;
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, '\'\'');
}

function buildServiceDiscoverySql(context = {}) {
  const tableName = normalizeIdentifier(context.tableName);
  if (!tableName) {
    return NODE_CLIENT_SERVICE_DISCOVERY_SQL;
  }
  return DISCOVERY_SQL_PREFIX +
    '\'' + escapeSqlLiteral(tableName) + '\'' +
    DISCOVERY_SQL_SUFFIX;
}

function createEmptyChannelMetrics() {
  return {
    [NODE_CLIENT_METRIC_KEY_REQUESTS]: ZERO,
    [NODE_CLIENT_METRIC_KEY_SUCCESSES]: ZERO,
    [NODE_CLIENT_METRIC_KEY_ERRORS]: ZERO,
    [NODE_CLIENT_METRIC_KEY_TIMEOUTS]: ZERO,
    [NODE_CLIENT_METRIC_KEY_RETRIES]: ZERO,
    [NODE_CLIENT_METRIC_KEY_BREAKER_OPENS]: ZERO,
    [NODE_CLIENT_METRIC_KEY_BUDGET_DENIALS]: ZERO,
    [NODE_CLIENT_METRIC_KEY_TIMEOUT_BUDGET_MISMATCHES]: ZERO,
    [NODE_CLIENT_METRIC_KEY_TIMED_OUT_IN_FLIGHT]: ZERO,
  };
}

function createMetricsSnapshot(metricsByChannel) {
  return Object.freeze({
    [NODE_CLIENT_CHANNEL.LOAD]: Object.freeze({
      ...metricsByChannel[NODE_CLIENT_CHANNEL.LOAD],
    }),
    [NODE_CLIENT_CHANNEL.CONTROL]: Object.freeze({
      ...metricsByChannel[NODE_CLIENT_CHANNEL.CONTROL],
    }),
    [NODE_CLIENT_CHANNEL.PROBE]: Object.freeze({
      ...metricsByChannel[NODE_CLIENT_CHANNEL.PROBE],
    }),
    [NODE_CLIENT_CHANNEL.SNAPSHOT]: Object.freeze({
      ...metricsByChannel[NODE_CLIENT_CHANNEL.SNAPSHOT],
    }),
  });
}

class NodeClient {
  constructor(options = {}) {
    this._policies = resolveNodeClientChannelPolicies({
      channelPolicies: options.channelPolicies,
      benchmarkConfig: options.benchmarkConfig,
    });
    this._nodeChannelState = new Map();
    this._metricsByChannel = {
      [NODE_CLIENT_CHANNEL.LOAD]: createEmptyChannelMetrics(),
      [NODE_CLIENT_CHANNEL.CONTROL]: createEmptyChannelMetrics(),
      [NODE_CLIENT_CHANNEL.PROBE]: createEmptyChannelMetrics(),
      [NODE_CLIENT_CHANNEL.SNAPSHOT]: createEmptyChannelMetrics(),
    };
  }

  async queryLoad(node, sql, params = [], context = {}) {
    return this._executeChannelOperation({
      node,
      channel: NODE_CLIENT_CHANNEL.LOAD,
      operation: OPERATION_QUERY_LOAD,
      context,
      invoke: (timeoutMs) => this._queryWithTimeout(
        node,
        sql,
        params,
        timeoutMs,
        NODE_CLIENT_CHANNEL.LOAD,
      ),
    });
  }

  async queryControl(node, sql, params = [], context = {}) {
    return this._executeChannelOperation({
      node,
      channel: NODE_CLIENT_CHANNEL.CONTROL,
      operation: OPERATION_QUERY_CONTROL,
      context,
      invoke: (timeoutMs) => this._queryWithTimeout(
        node,
        sql,
        params,
        timeoutMs,
        NODE_CLIENT_CHANNEL.CONTROL,
      ),
    });
  }

  async probeReadiness(node, scope = DEFAULT_PROBE_SCOPE, context = {}) {
    return this._executeChannelOperation({
      node,
      channel: NODE_CLIENT_CHANNEL.PROBE,
      operation: OPERATION_PROBE_READINESS,
      context: {
        ...context,
        scope,
      },
      invoke: (timeoutMs) => this._probeReadiness(node, timeoutMs, scope),
    });
  }

  async fetchControlSnapshot(node, context = {}) {
    return this._executeChannelOperation({
      node,
      channel: NODE_CLIENT_CHANNEL.SNAPSHOT,
      operation: OPERATION_FETCH_CONTROL_SNAPSHOT,
      context,
      invoke: async (timeoutMs) => {
        const rawResult = await this._queryWithTimeout(
          node,
          NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
          [],
          timeoutMs,
          NODE_CLIENT_CHANNEL.SNAPSHOT,
        );
        return this._normalizeControlSnapshot(rawResult, node);
      },
    });
  }

  async fetchServiceDiscovery(node, context = {}) {
    const discoverySql = buildServiceDiscoverySql(context);
    return this._executeChannelOperation({
      node,
      channel: NODE_CLIENT_CHANNEL.SNAPSHOT,
      operation: OPERATION_FETCH_SERVICE_DISCOVERY,
      context,
      invoke: async (timeoutMs) => {
        const rawResult = await this._queryWithTimeout(
          node,
          discoverySql,
          [],
          timeoutMs,
          NODE_CLIENT_CHANNEL.SNAPSHOT,
        );
        return this._normalizeServiceDiscovery(rawResult, node, context);
      },
    });
  }

  getPolicySnapshot() {
    return resolveNodeClientChannelPolicies({
      channelPolicies: this._policies,
    });
  }

  getMetricsSnapshot() {
    return createMetricsSnapshot(this._metricsByChannel);
  }

  async _executeChannelOperation(options) {
    const node = options.node;
    const nodeId = normalizeNodeId(node);
    const channel = options.channel;
    const operation = options.operation;
    const policy = this._policies[channel];
    const timeoutMs = resolveOperationTimeoutMs(
      options.context,
      policy.timeoutMs,
    );
    const state = this._getNodeChannelState(nodeId, channel);
    this._recordTimeoutBudgetMismatch(channel, timeoutMs, options.context);

    this._incrementMetric(channel, NODE_CLIENT_METRIC_KEY_REQUESTS);

    if (this._isCircuitOpen(state)) {
      throw this._createNodeClientError({
        nodeId,
        channel,
        operation,
        code: NODE_CLIENT_ERROR_CODES.CIRCUIT_OPEN,
        timeoutClass: NODE_CLIENT_TIMEOUT_CLASS.NONE,
        cause: new Error('circuit breaker is open'),
      });
    }

    if (!this._tryAcquireBudget(state, policy.maxInFlightPerNode)) {
      this._incrementMetric(channel, NODE_CLIENT_METRIC_KEY_BUDGET_DENIALS);
      throw this._createNodeClientError({
        nodeId,
        channel,
        operation,
        code: NODE_CLIENT_ERROR_CODES.BUDGET_EXHAUSTED,
        timeoutClass: NODE_CLIENT_TIMEOUT_CLASS.NONE,
        cause: new Error('per-node in-flight budget exhausted'),
      });
    }

    const maxAttempts = ONE + Math.max(ZERO, policy.retryBudget);
    let attempt = ZERO;

    try {
      while (attempt < maxAttempts) {
        attempt += ONE;
        try {
          const result = await options.invoke(timeoutMs, attempt);
          this._recordResponseTimeoutBudgetMismatch(channel, timeoutMs, result);
          this._recordNodeSuccess(state);
          this._incrementMetric(channel, NODE_CLIENT_METRIC_KEY_SUCCESSES);
          return result;
        } catch (error) {
          const normalizedError = this._normalizeOperationError({
            nodeId,
            channel,
            operation,
            error,
          });

          if (normalizedError.timeoutClass === NODE_CLIENT_TIMEOUT_CLASS.TIMEOUT) {
            this._incrementMetric(channel, NODE_CLIENT_METRIC_KEY_TIMEOUTS);
            if (state.inFlight > ZERO) {
              this._incrementMetric(
                channel,
                NODE_CLIENT_METRIC_KEY_TIMED_OUT_IN_FLIGHT,
              );
            }
          }
          this._incrementMetric(channel, NODE_CLIENT_METRIC_KEY_ERRORS);
          this._recordNodeFailure(state, policy, channel);

          const canRetry = attempt < maxAttempts;
          if (canRetry) {
            this._incrementMetric(channel, NODE_CLIENT_METRIC_KEY_RETRIES);
            continue;
          }

          throw normalizedError;
        }
      }

      throw this._createNodeClientError({
        nodeId,
        channel,
        operation,
        code: NODE_CLIENT_ERROR_CODES.OPERATION,
        timeoutClass: NODE_CLIENT_TIMEOUT_CLASS.NON_TIMEOUT,
        cause: new Error('operation ended without a result'),
      });
    } finally {
      this._releaseBudget(state);
    }
  }

  _queryWithTimeout(node, sql, params, timeoutMs, lane) {
    if (typeof node?.[QUERY_WITH_TIMEOUT_METHOD] !== 'function') {
      throw new Error(
        'Node handle missing queryWithTimeout(node=' +
          normalizeNodeId(node) + ')',
      );
    }
    return node.queryWithTimeout(
      sql,
      Array.isArray(params) ? params : [],
      {
        timeoutMs,
        lane,
      },
    );
  }

  _probeReadiness(node, timeoutMs, scope) {
    if (typeof node?.[GET_REACHABILITY_DIAGNOSTICS_METHOD] !== 'function') {
      throw new Error(
        'Node handle missing getReachabilityDiagnostics(node=' +
          normalizeNodeId(node) + ')',
      );
    }
    return withTimeout(
      Promise.resolve(
        node.getReachabilityDiagnostics({
          timeoutMs,
          scope,
        }),
      ).then((diagnostics) => {
        if (diagnostics && typeof diagnostics === 'object') {
          return {
            ...diagnostics,
            probeTimeoutMs: Number.isFinite(diagnostics.probeTimeoutMs) ?
              Math.floor(diagnostics.probeTimeoutMs) :
              timeoutMs,
          };
        }
        return diagnostics;
      }),
      timeoutMs,
      'Readiness probe timed out for node ' +
        normalizeNodeId(node) +
        ' scope ' +
        String(scope || DEFAULT_PROBE_SCOPE),
    );
  }

  _getNodeChannelState(nodeId, channel) {
    const key = channel + '::' + nodeId;
    let state = this._nodeChannelState.get(key);
    if (!state) {
      state = {
        inFlight: ZERO,
        consecutiveFailures: ZERO,
        openUntilMs: ZERO,
      };
      this._nodeChannelState.set(key, state);
    }
    return state;
  }

  _isCircuitOpen(state) {
    const now = Date.now();
    if (state.openUntilMs <= now) {
      return false;
    }
    return true;
  }

  _tryAcquireBudget(state, maxInFlightPerNode) {
    if (state.inFlight >= maxInFlightPerNode) {
      return false;
    }
    state.inFlight += ONE;
    return true;
  }

  _releaseBudget(state) {
    if (state.inFlight <= ZERO) {
      state.inFlight = ZERO;
      return;
    }
    state.inFlight -= ONE;
  }

  _recordNodeSuccess(state) {
    state.consecutiveFailures = ZERO;
    state.openUntilMs = ZERO;
  }

  _recordNodeFailure(state, policy, channel) {
    state.consecutiveFailures += ONE;
    if (state.consecutiveFailures < policy.circuitBreakerThreshold) {
      return;
    }
    state.consecutiveFailures = ZERO;
    state.openUntilMs = Date.now() + policy.cooldownMs;
    this._incrementMetric(channel, NODE_CLIENT_METRIC_KEY_BREAKER_OPENS);
  }

  _normalizeOperationError(options) {
    if (options.error instanceof NodeClientError) {
      return options.error;
    }
    const timeoutClass = classifyTimeoutClass(options.error);
    const code = timeoutClass === NODE_CLIENT_TIMEOUT_CLASS.TIMEOUT ?
      NODE_CLIENT_ERROR_CODES.TIMEOUT :
      NODE_CLIENT_ERROR_CODES.OPERATION;
    return this._createNodeClientError({
      nodeId: options.nodeId,
      channel: options.channel,
      operation: options.operation,
      code,
      timeoutClass,
      cause: options.error,
    });
  }

  _createNodeClientError(options) {
    const detail = normalizeErrorMessage(options.cause);
    const message =
      'NodeClient ' + options.operation +
      ' failed (node=' + options.nodeId +
      ', channel=' + options.channel +
      ', timeoutClass=' + options.timeoutClass +
      ', code=' + options.code +
      '): ' + detail;

    return new NodeClientError({
      message,
      code: options.code,
      nodeId: options.nodeId,
      channel: options.channel,
      operation: options.operation,
      timeoutClass: options.timeoutClass,
      cause: options.cause,
    });
  }

  _incrementMetric(channel, key) {
    if (!NODE_CLIENT_METRIC_KEYS.includes(key)) {
      return;
    }
    const channelMetrics = this._metricsByChannel[channel];
    channelMetrics[key] += ONE;
  }

  _recordTimeoutBudgetMismatch(channel, outerTimeoutMs, context = {}) {
    const innerTimeoutMs = Number(context?.innerTimeoutMs);
    if (!Number.isFinite(innerTimeoutMs) || innerTimeoutMs <= ZERO) {
      return;
    }
    if (Math.floor(innerTimeoutMs) === Math.floor(outerTimeoutMs)) {
      return;
    }
    this._incrementMetric(
      channel,
      NODE_CLIENT_METRIC_KEY_TIMEOUT_BUDGET_MISMATCHES,
    );
  }

  _recordResponseTimeoutBudgetMismatch(channel, outerTimeoutMs, result) {
    const probeTimeoutMs = Number(result?.probeTimeoutMs);
    if (!Number.isFinite(probeTimeoutMs) || probeTimeoutMs <= ZERO) {
      return;
    }
    if (Math.floor(probeTimeoutMs) === Math.floor(outerTimeoutMs)) {
      return;
    }
    this._incrementMetric(
      channel,
      NODE_CLIENT_METRIC_KEY_TIMEOUT_BUDGET_MISMATCHES,
    );
  }

  _normalizeControlSnapshot(rawResult, node) {
    const snapshot = this._extractSnapshotPayload(rawResult);
    const schemaVersion = snapshot[SNAPSHOT_FIELD_SCHEMA_VERSION];
    if (schemaVersion !== NODE_CLIENT_CONTROL_SNAPSHOT_SCHEMA_VERSION) {
      throw new Error(
        SNAPSHOT_FIELD_SCHEMA_VERSION + ' mismatch for node ' +
          normalizeNodeId(node) +
          ': expected ' +
          NODE_CLIENT_CONTROL_SNAPSHOT_SCHEMA_VERSION +
          ', got ' +
          String(schemaVersion),
      );
    }
    if (typeof snapshot[SNAPSHOT_FIELD_NODE_ID] !== 'string' ||
        snapshot[SNAPSHOT_FIELD_NODE_ID].length === ZERO) {
      throw new Error(
        'snapshot missing string ' + SNAPSHOT_FIELD_NODE_ID +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Number.isFinite(snapshot[SNAPSHOT_FIELD_CAPTURED_AT])) {
      throw new Error(
        'snapshot missing numeric ' + SNAPSHOT_FIELD_CAPTURED_AT +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Array.isArray(snapshot[SNAPSHOT_FIELD_NODES])) {
      throw new Error(
        'snapshot missing array ' + SNAPSHOT_FIELD_NODES +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Array.isArray(snapshot[SNAPSHOT_FIELD_PARTITIONS])) {
      throw new Error(
        'snapshot missing array ' + SNAPSHOT_FIELD_PARTITIONS +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!snapshot[SNAPSHOT_FIELD_LEADERS] ||
        typeof snapshot[SNAPSHOT_FIELD_LEADERS] !== 'object') {
      throw new Error(
        'snapshot missing object ' + SNAPSHOT_FIELD_LEADERS +
          ' for node ' + normalizeNodeId(node),
      );
    }
    const replicaOperations = snapshot[SNAPSHOT_FIELD_REPLICA_OPERATIONS];
    if (!replicaOperations || typeof replicaOperations !== 'object') {
      throw new Error(
        'snapshot missing object ' + SNAPSHOT_FIELD_REPLICA_OPERATIONS +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Number.isInteger(replicaOperations[SNAPSHOT_FIELD_IN_FLIGHT_COUNT]) ||
        replicaOperations[SNAPSHOT_FIELD_IN_FLIGHT_COUNT] < ZERO) {
      throw new Error(
        'snapshot missing integer ' + SNAPSHOT_FIELD_IN_FLIGHT_COUNT +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!replicaOperations[SNAPSHOT_FIELD_STATUS_HISTOGRAM] ||
        typeof replicaOperations[SNAPSHOT_FIELD_STATUS_HISTOGRAM] !== 'object') {
      throw new Error(
        'snapshot missing object ' + SNAPSHOT_FIELD_STATUS_HISTOGRAM +
          ' for node ' + normalizeNodeId(node),
      );
    }
    const partitionGroupInFlight =
      replicaOperations[SNAPSHOT_FIELD_PARTITION_GROUP_IN_FLIGHT];
    if (partitionGroupInFlight !== undefined &&
        (partitionGroupInFlight === null ||
          typeof partitionGroupInFlight !== 'object' ||
          Array.isArray(partitionGroupInFlight))) {
      throw new Error(
        'snapshot invalid object ' + SNAPSHOT_FIELD_PARTITION_GROUP_IN_FLIGHT +
          ' for node ' + normalizeNodeId(node),
      );
    }
    const normalizedPartitionGroupInFlight = {};
    if (partitionGroupInFlight && typeof partitionGroupInFlight === 'object') {
      for (const [groupId, value] of Object.entries(partitionGroupInFlight)) {
        const parsedValue = Number(value);
        if (!Number.isInteger(parsedValue) || parsedValue < ZERO) {
          throw new Error(
            'snapshot invalid integer in ' +
              SNAPSHOT_FIELD_PARTITION_GROUP_IN_FLIGHT +
              ' for node ' + normalizeNodeId(node) +
              ' group ' + String(groupId),
          );
        }
        normalizedPartitionGroupInFlight[String(groupId)] = parsedValue;
      }
    }
    return {
      [SNAPSHOT_FIELD_SCHEMA_VERSION]: schemaVersion,
      [SNAPSHOT_FIELD_NODE_ID]: snapshot[SNAPSHOT_FIELD_NODE_ID],
      [SNAPSHOT_FIELD_CAPTURED_AT]: snapshot[SNAPSHOT_FIELD_CAPTURED_AT],
      [SNAPSHOT_FIELD_NODES]: [...snapshot[SNAPSHOT_FIELD_NODES]],
      [SNAPSHOT_FIELD_PARTITIONS]: [...snapshot[SNAPSHOT_FIELD_PARTITIONS]],
      [SNAPSHOT_FIELD_LEADERS]: {
        ...snapshot[SNAPSHOT_FIELD_LEADERS],
      },
      [SNAPSHOT_FIELD_REPLICA_OPERATIONS]: {
        [SNAPSHOT_FIELD_IN_FLIGHT_COUNT]:
          replicaOperations[SNAPSHOT_FIELD_IN_FLIGHT_COUNT],
        [SNAPSHOT_FIELD_STATUS_HISTOGRAM]: {
          ...replicaOperations[SNAPSHOT_FIELD_STATUS_HISTOGRAM],
        },
        [SNAPSHOT_FIELD_PARTITION_GROUP_IN_FLIGHT]:
          normalizedPartitionGroupInFlight,
      },
    };
  }

  _normalizeServiceDiscovery(rawResult, node, context = {}) {
    const snapshot = this._extractSnapshotPayload(rawResult);
    const schemaVersion = snapshot[DISCOVERY_FIELD_SCHEMA_VERSION];
    if (schemaVersion !== NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION) {
      throw new Error(
        DISCOVERY_FIELD_SCHEMA_VERSION + ' mismatch for node ' +
          normalizeNodeId(node) +
          ': expected ' +
          NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION +
          ', got ' +
          String(schemaVersion),
      );
    }
    if (typeof snapshot[DISCOVERY_FIELD_NODE_ID] !== 'string' ||
        snapshot[DISCOVERY_FIELD_NODE_ID].length === ZERO) {
      throw new Error(
        'discovery missing string ' + DISCOVERY_FIELD_NODE_ID +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Number.isFinite(snapshot[DISCOVERY_FIELD_CAPTURED_AT])) {
      throw new Error(
        'discovery missing numeric ' + DISCOVERY_FIELD_CAPTURED_AT +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Number.isInteger(snapshot[DISCOVERY_FIELD_SERVICE_COUNT]) ||
        snapshot[DISCOVERY_FIELD_SERVICE_COUNT] < ZERO) {
      throw new Error(
        'discovery missing integer ' + DISCOVERY_FIELD_SERVICE_COUNT +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Number.isInteger(snapshot[DISCOVERY_FIELD_REPLICA_COUNT]) ||
        snapshot[DISCOVERY_FIELD_REPLICA_COUNT] < ZERO) {
      throw new Error(
        'discovery missing integer ' + DISCOVERY_FIELD_REPLICA_COUNT +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Array.isArray(snapshot[DISCOVERY_FIELD_SERVICES])) {
      throw new Error(
        'discovery missing array ' + DISCOVERY_FIELD_SERVICES +
          ' for node ' + normalizeNodeId(node),
      );
    }

    const normalizedServices = snapshot[DISCOVERY_FIELD_SERVICES]
      .map((service, index) =>
        this._normalizeServiceDiscoveryService(service, node, index, context),
      );

    return {
      ...snapshot,
      [DISCOVERY_FIELD_SCHEMA_VERSION]: schemaVersion,
      [DISCOVERY_FIELD_NODE_ID]: snapshot[DISCOVERY_FIELD_NODE_ID],
      [DISCOVERY_FIELD_CAPTURED_AT]: snapshot[DISCOVERY_FIELD_CAPTURED_AT],
      [DISCOVERY_FIELD_SERVICE_COUNT]: snapshot[DISCOVERY_FIELD_SERVICE_COUNT],
      [DISCOVERY_FIELD_REPLICA_COUNT]: snapshot[DISCOVERY_FIELD_REPLICA_COUNT],
      [DISCOVERY_FIELD_SERVICES]: normalizedServices,
    };
  }

  _normalizeServiceDiscoveryService(service, node, serviceIndex, context = {}) {
    if (!service || typeof service !== 'object') {
      throw new Error(
        'discovery service entry must be object at index ' +
          String(serviceIndex) +
          ' for node ' +
          normalizeNodeId(node),
      );
    }
    if (typeof service[DISCOVERY_SERVICE_FIELD_SERVICE_KEY] !== 'string' ||
        service[DISCOVERY_SERVICE_FIELD_SERVICE_KEY].length === ZERO) {
      throw new Error(
        'discovery service missing string ' +
          DISCOVERY_SERVICE_FIELD_SERVICE_KEY +
          ' at index ' + String(serviceIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (typeof service[DISCOVERY_SERVICE_FIELD_LOGICAL_SERVICE_NAME] !== 'string' ||
        service[DISCOVERY_SERVICE_FIELD_LOGICAL_SERVICE_NAME].length === ZERO) {
      throw new Error(
        'discovery service missing string ' +
          DISCOVERY_SERVICE_FIELD_LOGICAL_SERVICE_NAME +
          ' at index ' + String(serviceIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (typeof service[DISCOVERY_SERVICE_FIELD_PROTOCOL] !== 'string' ||
        service[DISCOVERY_SERVICE_FIELD_PROTOCOL].length === ZERO) {
      throw new Error(
        'discovery service missing string ' +
          DISCOVERY_SERVICE_FIELD_PROTOCOL +
          ' at index ' + String(serviceIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Array.isArray(service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS])) {
      throw new Error(
        'discovery service missing array ' +
          DISCOVERY_SERVICE_FIELD_SERVICE_IDS +
          ' at index ' + String(serviceIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Array.isArray(service[DISCOVERY_SERVICE_FIELD_NODES])) {
      throw new Error(
        'discovery service missing array ' +
          DISCOVERY_SERVICE_FIELD_NODES +
          ' at index ' + String(serviceIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Array.isArray(service[DISCOVERY_SERVICE_FIELD_REPLICAS])) {
      throw new Error(
        'discovery service missing array ' +
          DISCOVERY_SERVICE_FIELD_REPLICAS +
          ' at index ' + String(serviceIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }

    const normalizedReplicas = service[DISCOVERY_SERVICE_FIELD_REPLICAS]
      .map((replica, replicaIndex) =>
        this._normalizeServiceDiscoveryReplica(
          replica,
          node,
          serviceIndex,
          replicaIndex,
          context,
        ),
      );

    return {
      ...service,
      [DISCOVERY_SERVICE_FIELD_SERVICE_IDS]:
        [...service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS]],
      [DISCOVERY_SERVICE_FIELD_NODES]:
        [...service[DISCOVERY_SERVICE_FIELD_NODES]],
      [DISCOVERY_SERVICE_FIELD_REPLICAS]: normalizedReplicas,
    };
  }

  _normalizeServiceDiscoveryReplica(
    replica,
    node,
    serviceIndex,
    replicaIndex,
    context = {},
  ) {
    if (!replica || typeof replica !== 'object') {
      throw new Error(
        'discovery replica entry must be object at service ' +
          String(serviceIndex) +
          ', replica ' + String(replicaIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }
    const requiredStringFields = [
      DISCOVERY_REPLICA_FIELD_ENDPOINT_ID,
      DISCOVERY_REPLICA_FIELD_SERVICE_ID,
      DISCOVERY_REPLICA_FIELD_NODE_ID,
      DISCOVERY_REPLICA_FIELD_ADDRESS,
      DISCOVERY_REPLICA_FIELD_HEALTH_STATUS,
    ];
    for (const field of requiredStringFields) {
      if (typeof replica[field] !== 'string' || replica[field].length === ZERO) {
        throw new Error(
          'discovery replica missing string ' +
            field +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
    }
    if (!Number.isInteger(replica[DISCOVERY_REPLICA_FIELD_PORT]) ||
        replica[DISCOVERY_REPLICA_FIELD_PORT] <= ZERO) {
      throw new Error(
        'discovery replica missing integer ' +
          DISCOVERY_REPLICA_FIELD_PORT +
          ' at service ' + String(serviceIndex) +
          ', replica ' + String(replicaIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (!Number.isFinite(replica[DISCOVERY_REPLICA_FIELD_UPDATED_AT])) {
      throw new Error(
        'discovery replica missing numeric ' +
          DISCOVERY_REPLICA_FIELD_UPDATED_AT +
          ' at service ' + String(serviceIndex) +
          ', replica ' + String(replicaIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }
    const metadata = replica[DISCOVERY_REPLICA_FIELD_METADATA];
    if (!metadata || typeof metadata !== 'object') {
      throw new Error(
        'discovery replica missing object ' +
          DISCOVERY_REPLICA_FIELD_METADATA +
          ' at service ' + String(serviceIndex) +
          ', replica ' + String(replicaIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }
    const readiness = this._normalizeServiceDiscoveryReplicaReadiness(
      replica,
      node,
      serviceIndex,
      replicaIndex,
      context,
    );

    return {
      ...replica,
      [DISCOVERY_REPLICA_FIELD_ENDPOINT_ID]:
        replica[DISCOVERY_REPLICA_FIELD_ENDPOINT_ID],
      [DISCOVERY_REPLICA_FIELD_SERVICE_ID]:
        replica[DISCOVERY_REPLICA_FIELD_SERVICE_ID],
      [DISCOVERY_REPLICA_FIELD_NODE_ID]:
        replica[DISCOVERY_REPLICA_FIELD_NODE_ID],
      [DISCOVERY_REPLICA_FIELD_ADDRESS]:
        replica[DISCOVERY_REPLICA_FIELD_ADDRESS],
      [DISCOVERY_REPLICA_FIELD_PORT]:
        replica[DISCOVERY_REPLICA_FIELD_PORT],
      [DISCOVERY_REPLICA_FIELD_HEALTH_STATUS]:
        replica[DISCOVERY_REPLICA_FIELD_HEALTH_STATUS],
      [DISCOVERY_REPLICA_FIELD_UPDATED_AT]:
        replica[DISCOVERY_REPLICA_FIELD_UPDATED_AT],
      [DISCOVERY_REPLICA_FIELD_METADATA]: {
        ...metadata,
      },
      ...(readiness ?
        {
          [DISCOVERY_REPLICA_FIELD_READINESS]: readiness,
        } :
        {}),
    };
  }

  _normalizeServiceDiscoveryReplicaReadiness(
    replica,
    node,
    serviceIndex,
    replicaIndex,
    context = {},
  ) {
    const readiness = replica[DISCOVERY_REPLICA_FIELD_READINESS];
    const requireReadiness = context.requireReadiness === true;
    if (!readiness || typeof readiness !== 'object') {
      if (!requireReadiness) {
        return null;
      }
      throw new Error(
        'discovery replica missing object ' +
          DISCOVERY_REPLICA_FIELD_READINESS +
          ' at service ' + String(serviceIndex) +
          ', replica ' + String(replicaIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }

    const requiredBooleanFields = [
      DISCOVERY_READINESS_FIELD_WORKLOAD_READY,
      DISCOVERY_READINESS_FIELD_ROUTING_READY,
      DISCOVERY_READINESS_FIELD_SCHEMA_READY,
      DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE,
    ];
    for (const field of requiredBooleanFields) {
      if (typeof readiness[field] !== 'boolean') {
        throw new Error(
          'discovery readiness missing boolean ' + field +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
    }
    if (!Number.isInteger(readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT]) ||
        readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT] < ZERO) {
      throw new Error(
        'discovery readiness missing integer ' +
          DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT +
          ' at service ' + String(serviceIndex) +
          ', replica ' + String(replicaIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }
    if (readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME] !== null &&
        typeof readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME] !== 'string') {
      throw new Error(
        'discovery readiness invalid ' + DISCOVERY_READINESS_FIELD_TABLE_NAME +
          ' at service ' + String(serviceIndex) +
          ', replica ' + String(replicaIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }

    const reasons = readiness[DISCOVERY_READINESS_FIELD_REASONS];
    if (!Array.isArray(reasons)) {
      throw new Error(
        'discovery readiness missing array ' +
          DISCOVERY_READINESS_FIELD_REASONS +
          ' at service ' + String(serviceIndex) +
          ', replica ' + String(replicaIndex) +
          ' for node ' + normalizeNodeId(node),
      );
    }

    const normalizedReasons = reasons.map((reason, reasonIndex) => {
      if (!reason || typeof reason !== 'object') {
        throw new Error(
          'discovery readiness reason must be object at service ' +
            String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ', reason ' + String(reasonIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (typeof reason[DISCOVERY_READINESS_REASON_FIELD_CODE] !== 'string' ||
          reason[DISCOVERY_READINESS_REASON_FIELD_CODE].length === ZERO) {
        throw new Error(
          'discovery readiness reason missing string ' +
            DISCOVERY_READINESS_REASON_FIELD_CODE +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ', reason ' + String(reasonIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const detail = reason[DISCOVERY_READINESS_REASON_FIELD_DETAIL];
      if (detail !== null && typeof detail !== 'string') {
        throw new Error(
          'discovery readiness reason invalid ' +
            DISCOVERY_READINESS_REASON_FIELD_DETAIL +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ', reason ' + String(reasonIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      return {
        [DISCOVERY_READINESS_REASON_FIELD_CODE]:
          reason[DISCOVERY_READINESS_REASON_FIELD_CODE],
        [DISCOVERY_READINESS_REASON_FIELD_DETAIL]: detail,
      };
    });

    return {
      [DISCOVERY_READINESS_FIELD_WORKLOAD_READY]:
        readiness[DISCOVERY_READINESS_FIELD_WORKLOAD_READY],
      [DISCOVERY_READINESS_FIELD_ROUTING_READY]:
        readiness[DISCOVERY_READINESS_FIELD_ROUTING_READY],
      [DISCOVERY_READINESS_FIELD_SCHEMA_READY]:
        readiness[DISCOVERY_READINESS_FIELD_SCHEMA_READY],
      [DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT]:
        readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT],
      [DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE]:
        readiness[DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE],
      [DISCOVERY_READINESS_FIELD_TABLE_NAME]:
        readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME] || null,
      [DISCOVERY_READINESS_FIELD_REASONS]: normalizedReasons,
    };
  }

  _extractSnapshotPayload(rawResult) {
    if (rawResult && typeof rawResult === 'object' &&
        Array.isArray(rawResult.rows) &&
        rawResult.rows.length > ZERO &&
        rawResult.rows[ZERO] &&
        typeof rawResult.rows[ZERO] === 'object') {
      return rawResult.rows[ZERO];
    }
    throw new Error('snapshot query returned no row payload');
  }
}

export {NodeClient, NodeClientError};
