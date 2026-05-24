import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  ControlPlaneSnapshotOwner,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
  CONTROL_PLANE_CONVERGENCE_PRESSURE_OUTCOME,
} from '../../src/control-plane/control-plane-error-classification.js';
import {
  buildTopologyConvergenceGraph,
  buildTopologyConvergenceReplayFixture,
  replayTopologyConvergenceFixture,
} from '../../src/diagnostics/topology-convergence-graph.js';
import * as ACTIVE_GATE_SNAPSHOT_TEST_STATE from './admin-control-snapshot-active-gate-fixture-state.js';

const TEST_DEFER_INLINE_OWNER_COMMAND_FIELD = 'deferInlineOwnerCommand';
const TEST_DEFERRED_SKIP_PUBLICATION_WRITE_READBACK = true;
const TEST_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD =
  'publicationActiveGateHandoff';
const TEST_PUBLISHED_ACTIVE_NODE_IDS_FIELD = 'publishedActiveNodeIds';
const TEST_ALLOW_EMPTY_PRELOADED_ROWS_FIELD = 'allowEmptyPreloadedRows';
const TEST_NODE_ROWS_FIELD = 'nodeRows';
const TEST_OWNER_QUEUE_STOPPED_REASON = 'owner_queue_stopped';
const TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON = 'selected_timeout';
const TEST_ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_DIVISOR = 2;
const TEST_AUTHORITATIVE_REPAIR_RETRY_AFTER_MS = 16000;

export function registerAdminControlSnapshotRepairHandoffReplayOutcomeTestCases() {
  test('AdminControlSnapshot forced repair deferral triggers handoff owner command before returning',
    async (t) => {
      const buildOptions = [];
      let reconcileOptions = null;
      const publicationActiveGateHandoff = {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
        expectedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
      };
      const localSnapshot = {
        nodes: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[0],
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS[1],
        ],
        controlPlaneDiagnostics: {
          publicationActiveGateHandoff,
          activeGateOwnerCohort: publicationActiveGateHandoff,
          publicationConvergence: {
            publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
            status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
            publishedActiveNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
            ],
            missingPublishedNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
            ],
          },
        },
      };
      const fallbackSnapshot = {
        nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
        controlPlaneDiagnostics: {
          publicationActiveGateHandoff,
          activeGateOwnerCohort: publicationActiveGateHandoff,
          publicationConvergence: {
            publicationEpoch: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
            status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
            publishedActiveNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
            ],
            missingPublishedNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
            ],
          },
        },
      };
      const catchupSnapshot = {
        nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
        controlPlaneDiagnostics: {
          publicationConvergence: {
            publicationEpoch:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
            status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
            publishedActiveNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
          },
        },
      };
      const repairFailure = {
        applied: false,
        skipped: false,
        failedTables: [TABLES.NODES],
        errors: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL],
        causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE],
        retryAfterMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        localQueryTransport: {
          state: 'ready',
          ready: true,
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
        controlPlaneReadinessService: {
          membershipPublicationService: {
            async reconcileActiveGateMembershipPublication(
              _publicationActiveGateHandoff,
              options = {},
            ) {
              reconcileOptions = options;
              return {
                schemaVersion: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_SCHEMA_VERSION,
                state:
                  ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
                publicationRow: {
                  publication_id:
                    ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
                  publication_kind:
                    ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_KIND,
                  publication_epoch:
                    ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
                  status: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
                  published_active_node_ids: [
                    ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                  ],
                  required_ack_node_ids: [
                    ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                  ],
                  acknowledged_node_ids: [
                    ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
                  ],
                },
              };
            },
          },
        },
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
      });
      snapshot.buildLocalControlSnapshot = async (options = {}) => {
        buildOptions.push(options);
        if (buildOptions.length === 1) {
          return localSnapshot;
        }
        return buildOptions.length === 2 ? fallbackSnapshot : catchupSnapshot;
      };
      snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
      snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
        shouldRepair: true,
        triggerCodes: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
        ],
        nodeCoverage: {
          activeProjection: {
            hasCoverageGap: true,
            missingNodeIds: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS],
          },
        },
      });
      snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () =>
        repairFailure;

      const result = await snapshot.resolveLocalControlSnapshot({
        forceAuthoritativeRepair: true,
        allowAuthoritativeRepair: true,
        queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      });

      t.match(
        reconcileOptions,
        {
          reconcileAuthoritativeMembershipPublication:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_AUTHORITATIVE_RECONCILE,
        },
        'forced repair deferral should trigger the owner command before returning',
      );
      t.equal(
        buildOptions.length,
        2,
        'a non-progressing forced-deferral owner outcome should not rebuild the snapshot from lower-level coverage deltas',
      );
      t.match(
        buildOptions[1],
        {
          forceAuthoritativeRepair: true,
          allowAuthoritativeRepair: true,
          queryTimeoutMs:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
          preferAuthoritativePublicationRead: true,
          allowAuthoritativeReadinessRefresh:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_CATCHUP_READINESS_REFRESH,
          reconcileAuthoritativeMembershipPublication: false,
          publicationActiveGateHandoff,
        },
        'forced-deferral should issue one bounded publication-owner refresh attempt without treating it as progressed truth',
      );
      t.same(
        result.nodes,
        [...localSnapshot.nodes],
        'without owner outcome progress, forced-deferral should keep the current local coverage instead of promoting partial refresh results',
      );
      t.match(
        result.controlPlaneDiagnostics.publicationConvergence
          .membershipPublicationHandoffOutcome,
        {
          state:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
        },
        'forced repair deferral should surface the owner outcome in publication convergence',
      );
    });

  test('AdminControlSnapshot forced repair failures preserve authoritative nodes query timeout replay evidence',
    async (t) => {
      const localSnapshot = {
        nodes: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
        },
      };
      const repairFailure = {
        applied: false,
        skipped: false,
        failedTables: [TABLES.NODES],
        errors: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_DETAIL],
        causeChain: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE,
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CAUSE,
        ],
        firstFailedParticipant: {
          failedTable: TABLES.NODES,
          participantNodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
          errorCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_QUERY_TIMEOUT_CODE,
          error: 'Query timeout after ' +
            `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS}ms`,
          retryAfterMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
      });
      snapshot.buildLocalControlSnapshot = async () => localSnapshot;
      snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
      snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
        shouldRepair: true,
        triggerCodes: ['discovery_node_coverage_gap'],
        nodeCoverage: {
          activeProjection: {
            hasCoverageGap: true,
          },
        },
      });
      snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () =>
        repairFailure;

      const error = await t.rejects(
        snapshot.resolveLocalControlSnapshot({
          forceAuthoritativeRepair: true,
          allowAuthoritativeRepair: true,
          queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
        }),
      );

      t.equal(
        error.cause,
        repairFailure,
        'forced repair failure should retain the structured repair result',
      );
      t.equal(
        error.message,
        `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_PREFIX} ` +
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_NODES_QUERY_TIMEOUT_DETAIL,
        'forced repair failure should expose the nodes query timeout detail',
      );

      const selectedSnapshotError =
        `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_ERROR}; ` +
        `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_FAILURE_PREFIX} ` +
        `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID} on lane ` +
        `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_LANE}: ${error.message}`;
      const graph = buildTopologyConvergenceGraph({
        report: {
          scenarios: [
            {
              scenario: 'rolling-restart',
              publicationConvergence: {
                publicationStatus: 'UNKNOWN',
                pendingAckCount: 0,
                blockedNodeCount: 0,
                missingPublishedCount: 0,
                activeGate: {
                  state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_TIMED_OUT_STATE,
                  ready: false,
                  progress: {
                    expectedNodeCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_EXPECTED_NODE_COUNT,
                    snapshotCoverageNodeCount:
                      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_NODE_COUNT,
                    snapshotCoverageComplete: false,
                    selectedSnapshotNodeId:
                      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
                    selectedSnapshotTimeoutMs:
                      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
                    selectedSnapshotError,
                    readinessDelay: {
                      cause: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
                      source: 'selectedSnapshotError',
                      recoverability:
                        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
                      error: selectedSnapshotError,
                    },
                  },
                },
              },
              readinessFailure: {
                mode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_MODE_STARTUP,
                classCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
                recoverability: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
                terminalReason: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_TERMINAL_STALLED,
                cause: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
                source: 'selectedSnapshotError',
              },
            },
          ],
        },
      });
      const replayFixture = buildTopologyConvergenceReplayFixture(graph);
      const replayResult = replayTopologyConvergenceFixture(replayFixture);
      const activeGateWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_EDGE_ID,
      );
      const readinessWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_EDGE_ID,
      );

      t.equal(
        replayResult.matches.preserved,
        true,
        'the replay fixture should preserve the owner-boundary classification',
      );
      t.match(
        replayFixture.publicationConvergence.activeGate.progress,
        {
          selectedSnapshotNodeId:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
          selectedSnapshotTimeoutMs:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
          selectedSnapshotSourceCause:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
          forcedRepairSnapshotCause:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
          authoritativeControlSnapshotQueryCause:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_TIMEOUT_REASON,
          activeGateSnapshotOwnerEdge:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY,
        },
        'replay progress should separate selected-source, forced-repair, and authoritative-query causes',
      );
      t.same(
        activeGateWitness.reasons,
        [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_TIMED_OUT_REASON,
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_TIMEOUT_REASON,
        ],
        'active-gate witness should identify the exact snapshot subcauses',
      );
      t.equal(
        readinessWitness.state,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_FRONTIER_DEFERRED,
        'readiness should remain downstream of active-gate no progress',
      );
      t.same(
        readinessWitness.reasons,
        [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_INHERITED_REASON],
        'readiness should not become the owning cause while snapshot coverage is blocked',
      );
      t.equal(
        readinessWitness.source.supportPath,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SUPPORT_PATH_INHERITED,
        'readiness support should preserve inherited active-gate support path',
      );
      t.equal(
        replayFixture.expected.frontierState,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_FRONTIER_BLOCKED,
        'replay fixture should keep active-gate snapshot coverage as the blocked frontier',
      );
    });

  test('Topology convergence replay separates authoritative nodes participant query pressure',
    async (t) => {
      const selectedSnapshotError =
        `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_ERROR}; ` +
        `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_FAILURE_PREFIX} ` +
        `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID} on lane ` +
        `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_LANE}: ` +
        `${ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_REPAIR_FAILURE_PREFIX} ` +
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_DETAIL;
      const graph = buildTopologyConvergenceGraph({
        report: {
          scenarios: [
            {
              scenario: 'rolling-restart',
              publicationConvergence: {
                publicationStatus: 'UNKNOWN',
                pendingAckCount: 0,
                blockedNodeCount: 0,
                missingPublishedCount: 0,
                activeGate: {
                  state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_TIMED_OUT_STATE,
                  ready: false,
                  progress: {
                    expectedNodeCount: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_EXPECTED_NODE_COUNT,
                    snapshotCoverageNodeCount:
                      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_NODE_COUNT,
                    snapshotCoverageComplete: false,
                    selectedSnapshotNodeId:
                      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
                    selectedSnapshotTimeoutMs:
                      ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
                    selectedSnapshotError,
                    readinessDelay: {
                      cause: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
                      source: 'selectedSnapshotError',
                      recoverability:
                        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
                      error: selectedSnapshotError,
                    },
                  },
                },
              },
              readinessFailure: {
                mode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_MODE_STARTUP,
                classCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
                recoverability: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_RECOVERABILITY_TERMINAL,
                terminalReason: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_TERMINAL_STALLED,
                cause: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_SNAPSHOT_TIMEOUT,
                source: 'selectedSnapshotError',
              },
            },
          ],
        },
      });
      const replayFixture = buildTopologyConvergenceReplayFixture(graph);
      const replayResult = replayTopologyConvergenceFixture(replayFixture);
      const activeGateWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_EDGE_ID,
      );
      const readinessWitness = graph.ownerWitnesses.find((witness) =>
        witness.edgeId === ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_EDGE_ID,
      );

      t.equal(
        replayResult.matches.preserved,
        true,
        'participant-failure replay should preserve the owner-boundary classification',
      );
      t.match(
        replayFixture.publicationConvergence.activeGate.progress,
        {
          selectedSnapshotNodeId:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
          selectedSnapshotTimeoutMs:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
          selectedSnapshotSourceCause:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
          forcedRepairSnapshotCause:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
          authoritativeControlSnapshotQueryCause:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_PRESSURE_REASON,
          activeGateSnapshotOwnerEdge:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OWNER_EDGE_AUTHORITATIVE_QUERY,
        },
        'participant-failure replay should keep authoritative nodes query pressure distinct from the forced repair stall',
      );
      t.same(
        activeGateWitness.reasons,
        [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_TIMED_OUT_REASON,
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_COVERAGE_INCOMPLETE_REASON,
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_SOURCE_TIMEOUT_REASON,
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_TIMEOUT_REASON,
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_AUTHORITATIVE_QUERY_PRESSURE_REASON,
        ],
        'active-gate witness should include authoritative nodes query pressure',
      );
      t.equal(
        readinessWitness.state,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_FRONTIER_DEFERRED,
        'readiness should stay downstream of active-gate no progress',
      );
      t.same(
        readinessWitness.reasons,
        [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_READINESS_INHERITED_REASON],
        'readiness should remain inherited support evidence',
      );
    });

  test('AdminControlSnapshot repair-deferred shared owner attempts publication catch-up before returning',
    async (t) => {
      const buildOptions = [];
      let reconcileOptions = null;
      const staleSnapshot = {
        nodes: ['node-1'],
        controlPlaneDiagnostics: {
          activeGateOwnerCohort: {
            state: 'pending',
            reasonCode: 'owner_reconcile_pending',
            pendingReconcileCount: 1,
            pendingReconcileNodeIds: ['node-2'],
          },
          publicationConvergence: {
            publicationEpoch: 1,
            status: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1'],
          },
        },
      };
      const catchupSnapshot = {
        nodes: ['node-1', 'node-2'],
        controlPlaneDiagnostics: {
          publicationConvergence: {
            publicationEpoch: 2,
            status: 'OPEN',
            publishedActiveNodeIds: ['node-1', 'node-2'],
          },
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
        controlPlaneReadinessService: {
          membershipPublicationService: {
            enqueueClusterMembershipReconcile(_reason, context = {}) {
              reconcileOptions = context;
            },
          },
        },
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
      });
      snapshot.buildLocalControlSnapshot = async (options = {}) => {
        buildOptions.push(options);
        return buildOptions.length === 1 ? staleSnapshot : catchupSnapshot;
      };
      snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
      snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
        shouldRepair: true,
        triggerCodes: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_CACHE_STALE_TRIGGER,
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
        causeChain: ['control_plane_backpressure'],
        retryAfterMs: 12000,
        localQueryTransport: {
          state: 'ready',
          ready: true,
        },
        errors: ['control_plane_pressure_degraded'],
      });

      const result = await snapshot.resolveLocalControlSnapshot({
        allowAuthoritativeRepair: true,
      });

      t.match(
        reconcileOptions,
        {
          preferAuthoritativeRead: true,
          publishedActiveNodeIds: ['node-1', 'node-2'],
          requiredAckNodeIds: ['node-1', 'node-2'],
          acknowledgedNodeIds: ['node-1', 'node-2'],
          allowPendingVisibility: true,
          allowPressureDefer: false,
          readProfile:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_READ_PROFILE,
          skipPublicationWriteReadback:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_SKIP_WRITE_READBACK,
        },
        'repair-deferred degradation should perform a narrow publication-owner reconcile before rebuilding the snapshot view',
      );
      t.equal(
        buildOptions.length,
        1,
        'repair-deferred degradation should trigger the owner command without rebuilding the snapshot',
      );
      t.same(
        result.nodes,
        ['node-1'],
        'the returned deferred snapshot should keep the original snapshot view',
      );
      t.match(
        result,
        {
          snapshotObservation: {
            state: 'deferred_refresh',
            contractState: 'deferred',
            nextAction: 'retry',
            retryAfterMs: 12000,
          },
          controlPlaneDiagnostics: {
            ordinaryRepairDeferred:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_DEFERRED,
            publicationConvergence: {
              publicationEpoch: 1,
              status: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1'],
            },
          },
          observationMode: 'repair_deferred',
        },
        'the trigger-only deferred snapshot should keep the structured deferred retry outcome',
      );
    });

  test('AdminControlSnapshot visible handoff refresh does not treat lower-level coverage changes as owner progress',
    async (t) => {
      const buildOptions = [];
      const publicationActiveGateHandoff = {
        state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
        reasonCode:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
        nextAction:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE,
        expectedNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
        ],
        publishedActiveNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS,
        ],
        pendingReconcileCount:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_COUNT,
        pendingReconcileNodeIds: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_PENDING_NODE_IDS,
        ],
      };
      const visibleOwnerOutcome = {
        state:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_PUBLISHED_VISIBLE,
        publicationRow: {
          publication_id:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_ID,
        },
      };
      const staleSnapshot = {
        nodes: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS[0],
        ],
        controlPlaneDiagnostics: {
          publicationActiveGateHandoff,
          activeGateOwnerCohort: publicationActiveGateHandoff,
          membershipPublicationHandoffOutcome: visibleOwnerOutcome,
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
            membershipPublicationHandoffOutcome: visibleOwnerOutcome,
          },
        },
      };
      const refreshedSnapshot = {
        nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS],
        controlPlaneDiagnostics: {
          publicationActiveGateHandoff: {
            ...publicationActiveGateHandoff,
            pendingReconcileCount: 0,
            pendingReconcileNodeIds: [],
          },
          activeGateOwnerCohort: {
            ...publicationActiveGateHandoff,
            pendingReconcileCount: 0,
            pendingReconcileNodeIds: [],
          },
          publicationConvergence: {
            publicationEpoch:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE
                .ACTIVE_GATE_HANDOFF_RECONCILE_RESULT_PUBLICATION_EPOCH,
            status:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE
                .ACTIVE_GATE_OWNER_TRUTH_PUBLICATION_STATUS,
            publishedActiveNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
                .ACTIVE_GATE_HANDOFF_RECONCILE_NODE_IDS,
            ],
          },
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_LOCAL_NODE_ID,
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
      });
      snapshot.buildLocalControlSnapshot = async (options = {}) => {
        buildOptions.push(options);
        return buildOptions.length === 1 ? staleSnapshot : refreshedSnapshot;
      };
      snapshot.canRunAuthoritativeControlSnapshotRepair = () => false;

      const result = await snapshot.resolveLocalControlSnapshot();

      t.equal(
        buildOptions.length,
        1,
        'without owner progress signals, visible handoff outcomes should not trigger a refresh rebuild',
      );
      t.same(
        result.nodes,
        [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_HANDOFF_RECONCILE_PUBLISHED_NODE_IDS[0],
        ],
        'coverage-only refresh deltas should not be accepted as owner progress',
      );
      t.equal(
        result.controlPlaneDiagnostics.publicationConvergence.publicationEpoch,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_PUBLICATION_EPOCH,
        'the stale snapshot publication epoch should be retained when owner outcome progress is absent',
      );
      t.equal(
        result.controlPlaneDiagnostics.publicationConvergence
          .membershipPublicationHandoffOutcome?.state,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_OUTCOME_WRITE_DEFERRED,
        'the retained snapshot should keep the deferred owner outcome instead of promoting stale coverage',
      );
    });
}
