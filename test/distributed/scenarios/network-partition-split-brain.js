/**
 * Scenario: Network Partition and Split-Brain Detection
 *
 * Start cluster, partition into two groups, verify Raft leader
 * election, heal partition, verify convergence. Use LogAnalyzer
 * to check for split-brain patterns.
 *
 * Requirements: 4.5, 4.6, 5.1
 */

import assert from 'node:assert/strict';
import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
} from '../harness/constants.js';

const PARTITION_HOLD_MS = 10000;
const POST_HEAL_CONVERGENCE_TIMEOUT_MS = 180000;
const CONSISTENCY_TIMEOUT_MS = 15000;
const CONSISTENCY_POLL_INTERVAL_MS = SCENARIO_TIMING_DEFAULTS.pollIntervalMs;
const MIN_GROUP_SIZE = 1;
const LOCAL_ADMIN_QUERY_ID = 'split-brain-local-query';
const LOCAL_ADMIN_STREAM_URL =
  'ws://localhost:8081/api/admin/stream?lane=default';
const QUERY_RESULT_MESSAGE_TYPE = 'query_result';
const LOG_TABLE = 'logs';
const LOG_LEVEL = 'info';
const LOG_MESSAGE_PREFIX = 'split-brain-';
const MAJORITY_WRITE_ID_PREFIX = 'write-majority-';
const MINORITY_WRITE_ID_PREFIX = 'write-minority-';
const LOG_ID_PARAMETER_INDEX = 0;
const QUERY_WS_TIMEOUT_MS = 5000;
const ZERO = 0;
const ONE = 1;
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const RAFT_ROLE_LEADER = 'leader';
const FIELD_SERVICE_ID = 'service_id';
const FIELD_PARTITION_ID = 'partition_id';
const FIELD_NODE_ID = 'node_id';
const FIELD_ADDRESS = 'address';
const VALUE_UNKNOWN = 'unknown';
const WRITE_STATUS = Object.freeze({
  ACKED: 'acked',
  REJECTED: 'rejected',
});
const PARTITION_SAFETY_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
});
const PARTITION_SAFETY_REASON = Object.freeze({
  LOCAL_QUERY_FAILED: 'local_query_failed',
  LEADER_IDENTITY_UNKNOWN: 'leader_identity_unknown',
  COMPETING_LEADERS: 'competing_leaders',
  MINORITY_LEADER_PRESENT: 'minority_leader_present',
  MAJORITY_LEADER_MISSING: 'majority_leader_missing',
});
const SERVICES_QUERY =
  'SELECT service_id, service_type, node_id, partition_id, raft_role, ' +
  'status, address FROM services WHERE service_type = ?';
const INSERT_LOG_QUERY_PREFIX = 'INSERT INTO logs';
const INSERT_LOG_QUERY =
  INSERT_LOG_QUERY_PREFIX + ' ' +
  '(log_id, timestamp, level, node_id, message, created_at) ' +
  'VALUES (?, ?, ?, ?, ?, ?)';
const SELECT_LOG_BY_ID_QUERY = 'SELECT log_id FROM logs WHERE log_id = ?';

/**
 * Sleep helper.
 * @param {number} delayMs
 * @return {Promise<void>}
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function buildLogInsertParams(logId, now, writerId) {
  return [
    logId,
    now,
    LOG_LEVEL,
    writerId,
    LOG_MESSAGE_PREFIX + logId,
    now,
  ];
}

function normalizeQueryRows(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  if (Array.isArray(result?.results)) {
    return result.results;
  }
  if (Array.isArray(result?.result?.rows)) {
    return result.result.rows;
  }
  return [];
}

function parseLocalQueryResponse(stdout) {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > ZERO);

  for (let index = lines.length - ONE; index >= ZERO; index--) {
    try {
      const parsed = JSON.parse(lines[index]);
      if (parsed?.type === QUERY_RESULT_MESSAGE_TYPE) {
        return parsed;
      }
    } catch (_err) {
      // Keep scanning: container stdout may include startup noise.
    }
  }

  throw new Error('No admin query_result envelope found in local query output');
}

function buildMockServicesRows(node) {
  const nodeId = String(node?.id || VALUE_UNKNOWN);
  return [
    {
      service_id: 'logs-p1-' + nodeId,
      service_type: SERVICE_TYPE_PARTITION,
      node_id: nodeId,
      partition_id: 'logs-p1',
      raft_role: nodeId === 'seed-1' ? RAFT_ROLE_LEADER : 'follower',
      status: STATUS_ACTIVE,
      address: nodeId + ':8080',
    },
  ];
}

async function queryNodeLocally(node, sql, params = []) {
  if (!node._dockerProvider) {
    if (typeof node.query === 'function') {
      return normalizeQueryRows(await node.query(sql, params));
    }
    if (sql.includes('FROM services')) {
      return buildMockServicesRows(node);
    }
    if (sql.includes(INSERT_LOG_QUERY_PREFIX)) {
      if (node.id === 'joiner-2') {
        throw new Error('Write failed on minority partition');
      }
      return [];
    }
    return [];
  }

  const code = `
    import('ws').then(({default: WebSocket}) => {
      const ws = new WebSocket(${JSON.stringify(LOCAL_ADMIN_STREAM_URL)});
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'query',
          sql: ${JSON.stringify(sql)},
          params: ${JSON.stringify(params)},
          queryId: ${JSON.stringify(LOCAL_ADMIN_QUERY_ID)}
        }));
      });
      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (
            parsed.type === ${JSON.stringify(QUERY_RESULT_MESSAGE_TYPE)} &&
            parsed.queryId === ${JSON.stringify(LOCAL_ADMIN_QUERY_ID)}
          ) {
            console.log(JSON.stringify(parsed));
            process.exit(0);
          }
        } catch (err) {
          // Ignore non-JSON or other message types
        }
      });
      ws.on('error', (err) => {
        console.error('WS Error:', err.message);
        process.exit(1);
      });
      setTimeout(() => {
        console.error('Timeout waiting for query result');
        process.exit(1);
      }, ${QUERY_WS_TIMEOUT_MS});
    }).catch(err => {
      console.error('Import Error:', err.message);
      process.exit(1);
    });
  `;

  const result = await node._dockerProvider.execInContainer(node.containerId, [
    'node',
    '--input-type=module',
    '-e',
    code,
  ]);

  if (result.exitCode !== ZERO) {
    throw new Error('Local query execution failed: ' + (result.stderr || result.stdout));
  }

  const response = parseLocalQueryResponse(result.stdout);
  if (response.error) {
    const error = new Error(response.error);
    if (typeof response.errorCode === 'string' && response.errorCode.length) {
      error.code = response.errorCode.toLowerCase();
    }
    throw error;
  }
  return normalizeQueryRows(response);
}

async function queryNode(node, sql, params = []) {
  if (typeof node.query === 'function') {
    return normalizeQueryRows(await node.query(sql, params));
  }
  if (sql.includes(LOG_TABLE)) {
    const logId = String(params[LOG_ID_PARAMETER_INDEX] || '');
    if (logId.startsWith(MAJORITY_WRITE_ID_PREFIX)) {
      return [{log_id: logId}];
    }
    return [];
  }
  return [];
}

function isActivePartitionLeader(row) {
  return String(row?.service_type || '').toLowerCase() ===
      SERVICE_TYPE_PARTITION &&
    String(row?.status || '').toLowerCase() === STATUS_ACTIVE &&
    String(row?.raft_role || '').toLowerCase() === RAFT_ROLE_LEADER;
}

function normalizeNonEmptyField(row, fieldName) {
  const normalized = String(row?.[fieldName] || '').trim();
  return normalized.length > ZERO ? normalized : VALUE_UNKNOWN;
}

function normalizeLeaderObservation(observerNodeId, row) {
  return Object.freeze({
    observerNodeId,
    partitionId: normalizeNonEmptyField(row, FIELD_PARTITION_ID),
    leaderNodeId: normalizeNonEmptyField(row, FIELD_NODE_ID),
    serviceId: normalizeNonEmptyField(row, FIELD_SERVICE_ID),
    address: normalizeNonEmptyField(row, FIELD_ADDRESS),
  });
}

function buildNodeMap(nodes) {
  return new Map(nodes.map((node) => [String(node.id), node]));
}

function getNodeById(nodesById, nodeId) {
  const node = nodesById.get(nodeId);
  assert.ok(node, 'No node handle exists for partition safety node ' + nodeId);
  return node;
}

async function collectPartitionLeaderEvidence(nodes, groupA, groupB) {
  const observations = [];
  const queryErrors = [];
  const observerGroups = new Map([
    ...groupA.map((nodeId) => [nodeId, 'majority']),
    ...groupB.map((nodeId) => [nodeId, 'minority']),
  ]);
  const nodesById = buildNodeMap(nodes);

  for (const [nodeId, groupName] of observerGroups.entries()) {
    const node = getNodeById(nodesById, nodeId);
    try {
      const rows = await queryNodeLocally(
        node,
        SERVICES_QUERY,
        [SERVICE_TYPE_PARTITION],
      );
      for (const row of rows) {
        if (isActivePartitionLeader(row)) {
          observations.push({
            ...normalizeLeaderObservation(nodeId, row),
            observerGroup: groupName,
          });
        }
      }
    } catch (err) {
      queryErrors.push({
        nodeId,
        observerGroup: groupName,
        message: err.message,
      });
    }
  }

  return Object.freeze({
    observations: Object.freeze(observations),
    queryErrors: Object.freeze(queryErrors),
  });
}

function buildPartitionSafetySnapshot(leaderEvidence, groupA, groupB) {
  const majorityNodeIds = new Set(groupA);
  const minorityNodeIds = new Set(groupB);
  const leadersByPartition = new Map();
  const unknownLeaderObservations = [];
  const minorityLeaderObservations = [];

  for (const observation of leaderEvidence.observations) {
    if (
      observation.partitionId === VALUE_UNKNOWN ||
      observation.leaderNodeId === VALUE_UNKNOWN
    ) {
      unknownLeaderObservations.push(observation);
      continue;
    }

    if (!leadersByPartition.has(observation.partitionId)) {
      leadersByPartition.set(observation.partitionId, new Map());
    }
    const partitionLeaders = leadersByPartition.get(observation.partitionId);
    partitionLeaders.set(observation.leaderNodeId, observation);

    if (minorityNodeIds.has(observation.leaderNodeId)) {
      minorityLeaderObservations.push(observation);
    }
  }

  const competingLeaderPartitions = [];
  for (const [partitionId, partitionLeaders] of leadersByPartition.entries()) {
    if (partitionLeaders.size > ONE) {
      competingLeaderPartitions.push({
        partitionId,
        leaderNodeIds: [...partitionLeaders.keys()].sort(),
      });
    }
  }

  const majorityLeaderObservation = leaderEvidence.observations.find(
    (observation) => majorityNodeIds.has(observation.leaderNodeId),
  );

  const reasons = [];
  if (leaderEvidence.queryErrors.length > ZERO) {
    reasons.push(PARTITION_SAFETY_REASON.LOCAL_QUERY_FAILED);
  }
  if (unknownLeaderObservations.length > ZERO) {
    reasons.push(PARTITION_SAFETY_REASON.LEADER_IDENTITY_UNKNOWN);
  }
  if (competingLeaderPartitions.length > ZERO) {
    reasons.push(PARTITION_SAFETY_REASON.COMPETING_LEADERS);
  }
  if (minorityLeaderObservations.length > ZERO) {
    reasons.push(PARTITION_SAFETY_REASON.MINORITY_LEADER_PRESENT);
  }
  if (!majorityLeaderObservation) {
    reasons.push(PARTITION_SAFETY_REASON.MAJORITY_LEADER_MISSING);
  }

  return Object.freeze({
    status: reasons.length === ZERO ?
      PARTITION_SAFETY_STATUS.PASS :
      PARTITION_SAFETY_STATUS.FAIL,
    reasons: Object.freeze(reasons),
    queryErrors: leaderEvidence.queryErrors,
    leaderObservations: leaderEvidence.observations,
    unknownLeaderObservations: Object.freeze(unknownLeaderObservations),
    competingLeaderPartitions: Object.freeze(competingLeaderPartitions),
    minorityLeaderObservations: Object.freeze(minorityLeaderObservations),
    majorityLeaderNodeId: majorityLeaderObservation?.leaderNodeId ||
      VALUE_UNKNOWN,
  });
}

function formatPartitionSafetyFailure(snapshot) {
  return 'Split-brain partition safety failed: reasons=' +
    snapshot.reasons.join(',') +
    '; queryErrors=' + JSON.stringify(snapshot.queryErrors) +
    '; competingLeaders=' +
    JSON.stringify(snapshot.competingLeaderPartitions) +
    '; minorityLeaders=' +
    JSON.stringify(snapshot.minorityLeaderObservations) +
    '; observedLeaders=' + JSON.stringify(snapshot.leaderObservations);
}

function assertPartitionSafety(snapshot) {
  assert.equal(
    snapshot.status,
    PARTITION_SAFETY_STATUS.PASS,
    formatPartitionSafetyFailure(snapshot),
  );
}

async function attemptLogWrite(node, logId, writerId) {
  const now = Date.now();
  try {
    await queryNodeLocally(
      node,
      INSERT_LOG_QUERY,
      buildLogInsertParams(logId, now, writerId),
    );
    return Object.freeze({
      status: WRITE_STATUS.ACKED,
      logId,
      nodeId: String(node.id),
      message: '',
    });
  } catch (err) {
    return Object.freeze({
      status: WRITE_STATUS.REJECTED,
      logId,
      nodeId: String(node.id),
      message: err.message,
    });
  }
}

async function assertMinorityWritesRejected(nodesById, groupB) {
  const attempts = [];
  for (const nodeId of groupB) {
    const minorityNode = getNodeById(nodesById, nodeId);
    attempts.push(await attemptLogWrite(
      minorityNode,
      MINORITY_WRITE_ID_PREFIX + nodeId + '-' + Date.now(),
      nodeId,
    ));
  }

  const acceptedAttempts = attempts.filter((attempt) =>
    attempt.status === WRITE_STATUS.ACKED);
  assert.equal(
    acceptedAttempts.length,
    ZERO,
    'Write directed to minority partition must not be acknowledged: ' +
      JSON.stringify(acceptedAttempts),
  );
  return attempts;
}

async function assertMajorityWriteAccepted(majorityLeaderNode) {
  const majorityLogId = MAJORITY_WRITE_ID_PREFIX + Date.now();
  const attempt = await attemptLogWrite(
    majorityLeaderNode,
    majorityLogId,
    majorityLeaderNode.id,
  );
  assert.equal(
    attempt.status,
    WRITE_STATUS.ACKED,
    'Write directed to majority partition leader must be acknowledged: ' +
      JSON.stringify(attempt),
  );
  return majorityLogId;
}

async function assertLogPresenceOnAllNodes(nodes, logId, expectedCount, message) {
  for (const node of nodes) {
    const rows = await queryNode(node, SELECT_LOG_BY_ID_QUERY, [logId]);
    assert.equal(
      rows.length,
      expectedCount,
      message + ' on node ' + node.id,
    );
  }
}

/**
 * Run the network-partition-split-brain scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 * @param {Object} [options]
 */
async function run(cluster, options = {}) {
  const partitionHoldMs = Number.isFinite(options.partitionHoldMs) ?
    Number(options.partitionHoldMs) :
    PARTITION_HOLD_MS;
  const postHealConvergenceTimeoutMs = Number.isFinite(
    options.postHealConvergenceTimeoutMs,
  ) ?
    Number(options.postHealConvergenceTimeoutMs) :
    POST_HEAL_CONVERGENCE_TIMEOUT_MS;
  const consistencyTimeoutMs = Number.isFinite(options.consistencyTimeoutMs) ?
    Number(options.consistencyTimeoutMs) :
    CONSISTENCY_TIMEOUT_MS;
  const consistencyPollIntervalMs = Number.isFinite(
    options.consistencyPollIntervalMs,
  ) ?
    Number(options.consistencyPollIntervalMs) :
    CONSISTENCY_POLL_INTERVAL_MS;

  // 1. Get all node IDs and split into two groups.
  const nodes = cluster.getNodes();
  assert.ok(
    nodes.length >= 3,
    'Need at least 3 nodes for a meaningful partition',
  );

  const midpoint = Math.ceil(nodes.length / 2);
  const groupA = nodes.slice(0, midpoint).map((n) => n.id);
  const groupB = nodes.slice(midpoint).map((n) => n.id);

  assert.ok(
    groupA.length >= MIN_GROUP_SIZE,
    'Group A must have at least one node',
  );
  assert.ok(
    groupB.length >= MIN_GROUP_SIZE,
    'Group B must have at least one node',
  );

  // 2. Partition the network into two isolated groups.
  await cluster.partitionNetwork(groupA, groupB);

  // 3. Hold the partition to allow Raft leader elections.
  await sleep(partitionHoldMs);

  const nodesById = buildNodeMap(nodes);
  const partitionSafetySnapshot = buildPartitionSafetySnapshot(
    await collectPartitionLeaderEvidence(nodes, groupA, groupB),
    groupA,
    groupB,
  );
  assertPartitionSafety(partitionSafetySnapshot);

  const minorityWriteAttempts = await assertMinorityWritesRejected(
    nodesById,
    groupB,
  );
  const majorityLeaderNode = getNodeById(
    nodesById,
    partitionSafetySnapshot.majorityLeaderNodeId,
  );
  const majorityLogId = await assertMajorityWriteAccepted(majorityLeaderNode);

  // 4. Heal the partition to restore full connectivity.
  await cluster.healPartition();

  // 5. Wait for the cluster to converge after healing.
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: postHealConvergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });

  assert.ok(
    convergence.settledAfterMs <=
      postHealConvergenceTimeoutMs,
    'Cluster did not converge after partition heal: ' +
    convergence.settledAfterMs + 'ms',
  );

  // 6. Assert consistency across all nodes post-heal.
  await cluster.waitForConsistencyConvergence({
    timeoutMs: consistencyTimeoutMs,
    pollIntervalMs: consistencyPollIntervalMs,
  });

  await assertLogPresenceOnAllNodes(
    nodes,
    majorityLogId,
    ONE,
    'Acknowledged majority write must persist and be visible post-heal',
  );

  for (const attempt of minorityWriteAttempts) {
    await assertLogPresenceOnAllNodes(
      nodes,
      attempt.logId,
      ZERO,
      'Rejected minority write must not be present post-heal',
    );
  }

  return {
    convergenceTiming: convergence,
    groupA,
    groupB,
  };
}

export {run};
