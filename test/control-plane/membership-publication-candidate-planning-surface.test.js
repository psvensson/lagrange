import {test} from '../../src/test-helpers/tap.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';

// The publication coordinator derives the membership CANDIDATE with the
// planner's recovery evidence: the AVAILABLE planning answer. The owner-read
// surface composes the durable publication row, which can say a publication
// is steady and satisfied while the planner still holds the priority
// partitions unspread. A candidate built on the owner read told readiness
// that priority recovery was inactive, and under degraded publication the
// source quorum lost its transport-backed recovery grace and its routability
// (managed-split-admission-reliability, run against the substrate branch).
// The read-policy owner names AUTHORITATIVE as the REMOVE-safety contract
// only; planning consumers read AVAILABLE, and this is one of them.

const NODE_ID = 'node-planning-surface';
const NOW_MS = 1_700_000_000_000;

function createCoordinator({availableAnswer, ownerReadAnswer, calls}) {
  return new MembershipPublicationCoordinator({
    nodeId: NODE_ID,
    controlPlanePublicationsOwner: {
      async listPublications() {
        return {rows: []};
      },
    },
    authoritativeControlPlaneView: {
      canRead() {
        return true;
      },
      async readRows() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: {
      async getAllNodeReadiness() {
        return [];
      },
      getRecoveryEpochHistoryByNodeId() {
        return {};
      },
      async getMembershipPublicationPlanningSnapshotBestEffort() {
        calls.push('available');
        return availableAnswer;
      },
      async getPriorityRecoveryPlanningAnswerForOwnerRead() {
        calls.push('owner-read');
        return ownerReadAnswer;
      },
    },
    systemTableCache: {
      getAll() {
        return [];
      },
    },
    now: () => NOW_MS,
  });
}

test('the membership candidate carries the AVAILABLE planning answer, never the owner read',
  async (t) => {
    const calls = [];
    const availableAnswer = Object.freeze({
      admissionState: 'priority_spread_pending',
      priorityRecoveryActive: true,
    });
    const ownerReadAnswer = Object.freeze({
      admissionState: 'steady_published',
      priorityRecoveryActive: false,
    });
    const coordinator = createCoordinator({availableAnswer, ownerReadAnswer, calls});
    const snapshot = await coordinator.readPublicationPlanningSnapshot();
    t.equal(snapshot.priorityRecoveryPlanningSnapshot, availableAnswer,
      'the candidate holds the planner answer, by identity');
    t.same(calls, ['available'],
      'the AVAILABLE surface was read once and the owner read not at all');
    t.end();
  });

test('a nested derivation still derives no planning evidence', async (t) => {
  const calls = [];
  const coordinator = createCoordinator({
    availableAnswer: {priorityRecoveryActive: true},
    ownerReadAnswer: {priorityRecoveryActive: false},
    calls,
  });
  const snapshot = await coordinator.readPublicationPlanningSnapshot({
    deferNestedPriorityRecoveryPlanning: true,
  });
  t.equal(snapshot.priorityRecoveryPlanningSnapshot, null,
    'the recursion-breaking contract is untouched');
  t.same(calls, [], 'and reads neither surface');
  t.end();
});
