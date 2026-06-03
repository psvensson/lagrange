import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  ControlPlaneSnapshotOwner,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../../src/control-plane/control-plane-error-classification.js';
import * as ACTIVE_GATE_SNAPSHOT_TEST_STATE from './admin-control-snapshot-active-gate-fixture-state.js';

test('AdminControlSnapshot owner recovery wake keeps retry after when accepted',
  async (t) => {
    const staleSnapshot = {
      nodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
      ],
      controlPlaneDiagnostics: {
        activeGateOwnerCohort: {
          state:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
          reasonCode:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
          nextAction:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
          expectedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
          ],
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          pendingReconcileCount:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
          pendingReconcileNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
        publicationConvergence: {
          publicationEpoch:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
          status:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
          ],
          missingPublishedNodeIds: [
            ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
          ],
        },
      },
    };
    const snapshot = new AdminControlSnapshot({
      nodeId:
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      controlPlaneReadinessService: {
        membershipPublicationService: {
          async reconcileActiveGateMembershipPublication() {
            return {
              schemaVersion:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE
                  .ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
              state:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE
                  .ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
              publicationRow: null,
              enqueued: true,
              retryAfterMs:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE
                  .ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
              controlPlaneConvergence: {
                schemaVersion:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE
                    .ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
                convergenceClass: CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
                pressureOutcome:
                  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME
                    .CRITICAL_ADMITTED,
                operation:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE
                    .ACTIVE_GATE_HANDOFF_RECONCILE_CRITICAL_OWNER_WAKE,
                retryAfterMs:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE
                    .ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
              },
            };
          },
        },
      },
    });
    snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: snapshot,
    });
    snapshot.buildLocalControlSnapshot = async () => staleSnapshot;
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_CACHE_STALE_TRIGGER,
      ],
      nodeCoverage: {
        activeProjection: {
          hasCoverageGap: false,
        },
      },
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => ({
      applied: false,
      failedTables: [TABLES.SERVICES],
      causeChain: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_CONTROL_PLANE_BACKPRESSURE_CAUSE,
      ],
      localQueryTransport: {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_QUERY_TRANSPORT_READY_STATE,
        ready: true,
      },
      errors: [
        ACTIVE_GATE_SNAPSHOT_TEST_STATE
          .ACTIVE_GATE_HANDOFF_RECONCILE_PRESSURE_DEGRADED_ERROR,
      ],
    });

    const result = await snapshot.resolveLocalControlSnapshot({
      allowAuthoritativeRepair: true,
    });

    t.match(
      result.snapshotObservation,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
        contractState:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
        nextAction:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
        retryAfterMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
      },
      'accepted owner recovery wakes should retain bounded owner retry cadence',
    );
    t.match(
      result.controlPlaneDiagnostics.publicationConvergence
        .membershipPublicationHandoffOutcome,
      {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        enqueued: true,
        retryAfterMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_OWNER_RETRY_AFTER_MS,
      },
      'diagnostics should expose the accepted owner recovery wake outcome',
    );
  });
