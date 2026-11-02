/**
 * Test support for quest serve-eligibility-committed-epoch-read: the readiness
 * owner's committed-epoch serve answer, as fixtures state it.
 */
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {
  SERVE_ELIGIBILITY_DECISION,
  SERVE_ELIGIBILITY_STATE,
  SERVE_ELIGIBILITY_UNAVAILABLE_REASON,
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
  return {
    calls,
    answerServeEligibility(nodeId) {
      calls.answers.push(nodeId);
      return answers.get(nodeId) || defaultAnswer;
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
