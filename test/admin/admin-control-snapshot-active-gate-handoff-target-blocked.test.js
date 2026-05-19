import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';

const LOCAL_NODE_ID = 'node-1';
const HANDOFF_SCHEMA_VERSION = 1;
const HANDOFF_STATE_PENDING = 'pending';
const HANDOFF_REASON_OWNER_RECONCILE_PENDING = 'owner_reconcile_pending';
const HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const HANDOFF_RUNTIME_PROMOTION_ALLOWED = false;
const HANDOFF_PENDING_RECONCILE_COUNT = 0;
const HANDOFF_EMPTY_NODE_IDS = Object.freeze([]);
const OUTCOME_STATE_TARGET_BLOCKED = 'target_blocked';
const TARGET_HANDOFF_STATE_UNAVAILABLE = 'unavailable';
const TARGET_HANDOFF_REASON_EXPECTED_COHORT_UNAVAILABLE =
  'expected_cohort_unavailable';
const TARGET_HANDOFF_NEXT_ACTION_OBSERVE_OWNER_HANDOFF =
  'observe_owner_handoff';

test('AdminControlSnapshot returns target-blocked outcome for empty active-gate handoff target',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: LOCAL_NODE_ID,
    });

    const publicationOutcome =
      await snapshot.reconcileAuthoritativeMembershipPublicationFromHandoff({
        schemaVersion: HANDOFF_SCHEMA_VERSION,
        state: HANDOFF_STATE_PENDING,
        reasonCode: HANDOFF_REASON_OWNER_RECONCILE_PENDING,
        nextAction: HANDOFF_NEXT_ACTION_RECONCILE,
        runtimePromotionAllowed: HANDOFF_RUNTIME_PROMOTION_ALLOWED,
        pendingReconcileCount: HANDOFF_PENDING_RECONCILE_COUNT,
        pendingReconcileNodeIds: [...HANDOFF_EMPTY_NODE_IDS],
        publishedActiveNodeIds: [...HANDOFF_EMPTY_NODE_IDS],
        expectedNodeIds: [...HANDOFF_EMPTY_NODE_IDS],
      });

    t.match(
      publicationOutcome,
      {
        state: OUTCOME_STATE_TARGET_BLOCKED,
        enqueued: false,
        target: {
          reconcileRequired: false,
          handoffContract: {
            state: TARGET_HANDOFF_STATE_UNAVAILABLE,
            reasonCode: TARGET_HANDOFF_REASON_EXPECTED_COHORT_UNAVAILABLE,
            nextAction: TARGET_HANDOFF_NEXT_ACTION_OBSERVE_OWNER_HANDOFF,
          },
        },
      },
      'empty active-gate handoff target should remain a typed owner outcome',
    );
  });
