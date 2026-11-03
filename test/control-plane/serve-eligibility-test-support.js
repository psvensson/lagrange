/**
 * Test support for quest serve-eligibility-committed-epoch-read: the readiness
 * owner's committed-epoch serve answer, as fixtures state it.
 */
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {PROJECTION_READINESS_CONTRACT_STATE} from
  '../../src/control-plane/projection-readiness-constants.js';
import {
  SERVE_ELIGIBILITY_DECISION,
  SERVE_ELIGIBILITY_STATE,
  SERVE_ELIGIBILITY_UNAVAILABLE_REASON,
  isServeEligibilityAnswerEligible,
} from '../../src/control-plane/serve-eligibility-owner.js';

const FIXTURE_EPOCH = Object.freeze({
  publicationEpoch: 1,
  publicationId: 'cluster_membership-1',
  readAtMs: 0,
});
const FIXTURE_RETRY_AFTER_MS = 1000;
const FIXTURE_LEASE_MS = 3_600_000;

/**
 * A committed answer: eligible, not eligible (with reasons), or a typed
 * unavailability.
 * @param {boolean|string} eligible true, false, or an unavailable reason.
 * @param {Object} [options]
 * @return {Object}
 */
export function serveEligibilityAnswer(eligible, options = {}) {
  const epoch = options.epoch || FIXTURE_EPOCH;
  if (typeof eligible === 'string') {
    return Object.freeze({
      state: SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
      reason: eligible,
      epoch: eligible === SERVE_ELIGIBILITY_UNAVAILABLE_REASON.STALE ?
        epoch : null,
      retryAfterMs: FIXTURE_RETRY_AFTER_MS,
    });
  }
  return Object.freeze({
    state: SERVE_ELIGIBILITY_STATE.READY,
    decision: eligible ?
      SERVE_ELIGIBILITY_DECISION.ELIGIBLE :
      SERVE_ELIGIBILITY_DECISION.NOT_ELIGIBLE,
    reasons: Object.freeze(eligible ? [] : (options.reasons || [])),
    epoch,
    leaseExpiresAtMs: Number.MAX_SAFE_INTEGER,
  });
}

/**
 * A mock readiness service's answerServeEligibility whose committed answer
 * mirrors the fixture's stated serve verdict for each node (the fixture plays
 * the owner; the code under test only consumes the answer).
 * @param {function(string): Object|null} readSnapshot the fixture's
 *   per-node snapshot with dimensions.serveEligible.
 * @return {function(string): Object}
 */
export function serveEligibilityFromFixture(readSnapshot) {
  return (nodeId) => serveEligibilityAnswer(
    readSnapshot(nodeId)?.dimensions?.[
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE
    ] === true,
  );
}

function fixtureNodeRow(nodeId, nowMs) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.BOOT_INCARNATION]: 1,
    [COLUMN.LAST_HEARTBEAT]: nowMs,
    [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + FIXTURE_LEASE_MS,
  };
}

/**
 * A readiness-owner view whose leader-required read answers the committed
 * nodes rows and a published membership for the given nodes.
 * @param {Object} options
 * @param {Array<string>} options.servingNodeIds nodes published and leased.
 * @param {number} [options.nowMs]
 * @param {Object} [options.publicationOverrides]
 * @return {Object}
 */
export function committedServeEligibilityView({
  servingNodeIds,
  nowMs = 0,
  publicationOverrides = {},
  nodeRowOverrides = {},
}) {
  const publication = {
    publication_id: FIXTURE_EPOCH.publicationId,
    publication_kind: 'cluster_membership',
    publication_epoch: FIXTURE_EPOCH.publicationEpoch,
    publisher_node_id: servingNodeIds[0] || 'publisher',
    published_active_node_ids: JSON.stringify(servingNodeIds),
    required_ack_node_ids: JSON.stringify(servingNodeIds),
    acknowledged_node_ids: JSON.stringify(servingNodeIds),
    priority_partition_summary: JSON.stringify({
      satisfied: true, blockedPartitions: [],
    }),
    status: 'PUBLISHED',
    created_at: nowMs,
    updated_at: nowMs,
    transition_history: '[]',
    ...publicationOverrides,
  };
  return {
    async readReadinessOwnerRows(tableName) {
      if (tableName === TABLES.NODES) {
        return {success: true, rows: servingNodeIds.map((nodeId) => ({
          ...fixtureNodeRow(nodeId, nowMs),
          ...(nodeRowOverrides[nodeId] || {}),
        }))};
      }
      if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
        return {success: true, rows: [publication]};
      }
      return {success: false, error: 'unexpected_table', rows: []};
    },
    canRead: () => true,
  };
}

const HEALTHY_PROJECTED_DIMENSIONS = Object.freeze(Object.fromEntries(
  Object.values(CONTROL_PLANE_READINESS_DIMENSION)
    .filter((name) => name !== CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE)
    .map((name) => [name, true]),
));

/**
 * A readiness owner as the query layer consumes it: per-node committed
 * answers at a stated epoch with a lease. Every node is eligible unless the
 * test states otherwise; setAnswer flips one node to not_eligible or a typed
 * unavailability (e.g. 'unavailable_stale'), setDefault flips every node.
 * The owner's refresh resolves immediately (the fixture's record is current).
 * @param {Object} [options]
 * @param {Object<string, Object>} [options.answers] nodeId -> answer.
 * @param {Object} [options.defaultAnswer]
 * @return {Object}
 */
export function createCommittedServeEligibilityOwner(options = {}) {
  const answers = new Map(Object.entries(options.answers || {}));
  let defaultAnswer = options.defaultAnswer || serveEligibilityAnswer(true);
  const calls = {answers: [], refreshes: 0};
  // Projected dimensions for non-serve consumers (gateway writes, managed
  // split/merge admission, mutation admission), which still read the
  // readiness projection until attempt 3: a healthy projection - every
  // non-serve dimension true - unless the test states otherwise
  // (projectedDimensions: null removes the projection read entirely). The
  // projected serve dimension mirrors the committed answer, as the readiness
  // owner's snapshots do.
  const projectedDimensions = Object.hasOwn(options, 'projectedDimensions') ?
    options.projectedDimensions :
    HEALTHY_PROJECTED_DIMENSIONS;
  const projected = projectedDimensions ?
    {
      getNodeReadinessSync: (nodeId) => {
        const serving = isServeEligibilityAnswerEligible(
          answers.get(nodeId) || defaultAnswer);
        return {
          nodeId,
          dimensions: {
            ...projectedDimensions,
            [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: serving,
          },
          // A converged publication: the projection contract a healthy
          // readiness owner states alongside its dimensions.
          projectionReadinessContract: {
            state: serving ?
              PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY :
              PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
            ready: serving,
            publication: {ready: true},
            priorityRecovery: {active: false},
          },
        };
      },
    } :
    {};
  return {
    ...projected,
    calls,
    answerServeEligibility(nodeId) {
      calls.answers.push(nodeId);
      return answers.get(nodeId) || defaultAnswer;
    },
    answerServeCohort(nodeIds) {
      const ids = Array.isArray(nodeIds) && nodeIds.length > 0 ?
        nodeIds :
        (answers.size > 0 ? [...answers.keys()] : ['node-a']);
      const resultAnswers = {};
      const eligibleNodeIds = [];
      let hasUnavailable = false;
      let firstUnavailableReason = null;
      for (const id of ids) {
        const ans = this.answerServeEligibility(id);
        resultAnswers[id] = ans;
        if (ans.state === SERVE_ELIGIBILITY_STATE.UNAVAILABLE) {
          hasUnavailable = true;
          if (!firstUnavailableReason) firstUnavailableReason = ans.reason;
        } else if (ans.decision === SERVE_ELIGIBILITY_DECISION.ELIGIBLE) {
          eligibleNodeIds.push(id);
        }
      }
      return {
        state: hasUnavailable ?
          SERVE_ELIGIBILITY_STATE.UNAVAILABLE :
          SERVE_ELIGIBILITY_STATE.READY,
        reason: hasUnavailable ? firstUnavailableReason : null,
        epoch: FIXTURE_EPOCH,
        answers: resultAnswers,
        eligibleNodeIds,
      };
    },
    async readServeEligibility() {
      calls.refreshes += 1;
    },
    subscribeServeEligibility() {
      return () => {};
    },
    setAnswer(nodeId, answer) {
      answers.set(nodeId, answer);
    },
    setDefault(answer) {
      defaultAnswer = answer;
    },
  };
}

/**
 * The committed answer a mock readiness service states through its own
 * getNodeReadinessSync serve verdict (one-line adapter for mocks).
 * @param {Object} readinessService
 * @param {string} nodeId
 * @return {Object}
 */
export function serveAnswerFromMock(readinessService, nodeId) {
  return serveEligibilityFromFixture(
    (id) => readinessService.getNodeReadinessSync(id))(nodeId);
}

/**
 * A committed PUBLISHED cluster_membership row naming the given nodes, all
 * acknowledged, with the priority spread stated satisfied.
 * @param {Array<string>} nodeIds
 * @param {number} [nowMs]
 * @return {Object}
 */
export function committedMembershipPublicationRow(nodeIds, nowMs = 0) {
  return {
    publication_id: FIXTURE_EPOCH.publicationId,
    publication_kind: 'cluster_membership',
    publication_epoch: FIXTURE_EPOCH.publicationEpoch,
    publisher_node_id: nodeIds[0] || 'publisher',
    published_active_node_ids: JSON.stringify(nodeIds),
    required_ack_node_ids: JSON.stringify(nodeIds),
    acknowledged_node_ids: JSON.stringify(nodeIds),
    priority_partition_summary: JSON.stringify({
      satisfied: true, blockedPartitions: [],
    }),
    status: 'PUBLISHED',
    created_at: nowMs,
    updated_at: nowMs,
    transition_history: '[]',
  };
}
