import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {TABLES} from '../../src/constants/index.js';
import {
  ControlPlaneSnapshotOwner,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import * as ACTIVE_GATE_SNAPSHOT_TEST_STATE from './admin-control-snapshot-active-gate-fixture-state.js';

const TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON = 'selected_timeout';
const TEST_ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY =
  'wait_owner_recovery';
const TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_DIVISOR = 2;
const TEST_AUTHORITATIVE_REPAIR_RETRY_AFTER_MS = 16000;

export function registerAdminControlSnapshotRepairHandoffForcedRepairFallbackTestCases() {
  test('AdminControlSnapshot repair-deferred shared owner emits retry action after attempted repair',
    async (t) => {
      let repairOptions = null;
      const localSnapshot = {
        nodes: ['node-1'],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
      });
      snapshot.buildLocalControlSnapshot = async () => localSnapshot;
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
      snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
        repairOptions = options;
        return {
          applied: false,
          failedTables: [TABLES.SERVICES],
          causeChain: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE
              .ACTIVE_GATE_HANDOFF_RECONCILE_CONTROL_PLANE_BACKPRESSURE_CAUSE,
          ],
          retryAfterMs: TEST_AUTHORITATIVE_REPAIR_RETRY_AFTER_MS,
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
        };
      };

      const result = await snapshot.resolveLocalControlSnapshot({
        allowAuthoritativeRepair: true,
        queryTimeoutMs:
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
      });

      t.equal(
        repairOptions?.queryTimeoutMs,
        Math.floor(
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS /
            TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_DIVISOR,
        ),
        'non-forced repair should reserve caller query time for the deferred snapshot response',
      );
      t.match(
        result,
        {
          snapshotObservation: {
            state: 'deferred_refresh',
            contractState: 'deferred',
            nextAction: 'retry',
            reasonCodes: ['cache_stale_watermark'],
            retryAfterMs: TEST_AUTHORITATIVE_REPAIR_RETRY_AFTER_MS,
            refreshState: 'deferred',
          },
          observationMode: 'repair_deferred',
          adminObservation: {
            sharedOwnerResolved: true,
            repair: {
              deferred: true,
            },
          },
          controlPlaneDiagnostics: {
            ordinaryRepairDeferred:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_HANDOFF_RECONCILE_ORDINARY_REPAIR_DEFERRED,
          },
        },
        'attempted repair deferral should expose a legal retry action instead of wait-only stale evidence',
      );
    });

  test('AdminControlSnapshot reserves caller query timeout for authoritative repair',
    async (t) => {
      let repairOptions = null;
      const localSnapshot = {
        nodes: ['node-1'],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
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
      snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
        repairOptions = options;
        return {
          applied: true,
        };
      };

      await snapshot.resolveLocalControlSnapshot({
        allowAuthoritativeRepair: true,
        queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
      });

      t.equal(
        repairOptions?.queryTimeoutMs,
        Math.floor(
          ACTIVE_GATE_SNAPSHOT_TEST_STATE
            .ACTIVE_GATE_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS /
            TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_DIVISOR,
        ),
        'authoritative snapshot repair should leave caller query budget for the snapshot response',
      );
    });

  test('AdminControlSnapshot forced participant repair failure preserves the local snapshot',
    async (t) => {
      const buildOptions = [];
      let sharedOwnerRepairCalls = 0;
      const localSnapshot = {
        nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
        },
      };
      const repairFailure = {
        applied: false,
        skipped: false,
        failedTables: [TABLES.NODES],
        errors: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL,
        ],
        causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
        firstFailedParticipant: {
          failedTable: TABLES.NODES,
          participantNodeId:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
          errorCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
          error: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
        serviceDiscovery: {
          async ensureAuthoritativeDiscoveryCacheRepair() {
            sharedOwnerRepairCalls += 1;
            throw new Error('shared owner force repair should stay deferred');
          },
        },
      });
      snapshot.buildLocalControlSnapshot = async (options = {}) => {
        buildOptions.push(options);
        return localSnapshot;
      };
      snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
      snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
        shouldRepair: true,
        triggerCodes: ['discovery_node_coverage_gap'],
        nodeCoverage: {
          activeProjection: {
            hasCoverageGap: true,
            missingNodeIds: ['node-4', 'node-5'],
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

      t.equal(
        buildOptions.length,
        1,
        'participant failure should preserve the already built local snapshot',
      );
      t.equal(
        sharedOwnerRepairCalls,
        0,
        'the shared snapshot owner should not retry force repair after a deferred participant failure',
      );
      t.same(
        result.nodes,
        [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
        'deferred participant failure should keep metric-moving snapshot coverage',
      );
      t.match(
        result,
        {
          observationMode:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
          snapshotObservation: {
            state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
            contractState:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
            nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
            reasonCodes: ['discovery_node_coverage_gap'],
          },
          adminObservation: {
            repair: {
              forced: true,
              deferred: true,
              applied: false,
            },
          },
          controlPlaneDiagnostics: {
            ordinaryRepairDeferred: true,
          },
        },
        'forced participant failure should become a structured deferred owner observation',
      );
    });

  test('AdminControlSnapshot forced participant repair failure returns a usable fallback snapshot',
    async (t) => {
      const buildOptions = [];
      let evaluationCalls = 0;
      let repairOptions = null;
      let sharedOwnerRepairCalls = 0;
      const emptySelectedSourceSnapshot = {
        nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
        },
      };
      const fallbackSnapshot = {
        nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
        },
      };
      const repairFailure = {
        applied: false,
        skipped: false,
        failedTables: [TABLES.NODES],
        errors: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL,
        ],
        causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
        firstFailedParticipant: {
          failedTable: TABLES.NODES,
          participantNodeId:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
          errorCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
          error: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
        serviceDiscovery: {
          async ensureAuthoritativeDiscoveryCacheRepair() {
            sharedOwnerRepairCalls += 1;
            throw new Error('shared owner force repair should stay deferred');
          },
        },
      });
      snapshot.buildLocalControlSnapshot = async (options = {}) => {
        buildOptions.push(options);
        if (
          buildOptions.length > 1 &&
          (
            options[
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
            ] === true ||
            options[
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
            ] === true ||
            options[
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
            ] === true
          )
        ) {
          throw new Error(
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
          );
        }
        return buildOptions.length === 1 ?
          emptySelectedSourceSnapshot :
          fallbackSnapshot;
      };
      snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
      snapshot.evaluateAuthoritativeControlSnapshotRepair = () => {
        evaluationCalls += 1;
        return {
          shouldRepair: true,
          triggerCodes: [
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
          ],
          nodeCoverage: {
            ...(evaluationCalls > 1 ?
              {
                sharedMetadata: {
                  referencedNodeIds: [
                    ...ACTIVE_GATE_SNAPSHOT_TEST_STATE
                      .ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS,
                  ],
                },
              } :
              {}),
            activeProjection: {
              hasCoverageGap: true,
              missingNodeIds: [
                ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS,
              ],
            },
          },
        };
      };
      snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
        repairOptions = options;
        return repairFailure;
      };

      const result = await snapshot.resolveLocalControlSnapshot({
        forceAuthoritativeRepair: true,
        allowAuthoritativeRepair: true,
        queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      });

      t.equal(
        buildOptions.length,
        2,
        'participant repair failure should try one local fallback when the selected source snapshot has no usable coverage',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
        ],
        false,
        'fallback should exit the forced repair path before reading the local cache',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
        ],
        false,
        'fallback should not schedule another authoritative repair while repair is deferred',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
        ],
        false,
        'fallback should avoid the failed authoritative publication read path',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_READINESS_REFRESH
        ],
        false,
        'fallback should not reopen readiness refresh',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_RECONCILE_AUTHORITATIVE_PUBLICATION
        ],
        false,
        'fallback should not reconcile publication while repair is deferred',
      );
      t.equal(
        repairOptions?.queryTimeoutMs,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
        'forced repair should reserve caller query time for returning the fallback snapshot',
      );
      t.equal(
        sharedOwnerRepairCalls,
        0,
        'the shared snapshot owner should not retry force repair after fallback deferral',
      );
      t.same(
        result.nodes,
        [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
          (left, right) => left.localeCompare(right),
        ),
        'deferred participant failure should project service-discovery references above two-of-five',
      );
      t.same(
        result.projectedNodes,
        [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
          (left, right) => left.localeCompare(right),
        ),
        'deferred participant failure should expose projected fallback coverage',
      );
      t.match(
        result,
        {
          observationMode:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
          snapshotObservation: {
            state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
            contractState:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
            nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
            reasonCodes: [
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
            ],
          },
          adminObservation: {
            repair: {
              forced: true,
              deferred: true,
              applied: false,
            },
          },
          controlPlaneDiagnostics: {
            ordinaryRepairDeferred: true,
          },
        },
        'connection-closed participant repair failure should become a structured deferred snapshot',
      );
    });

  test('AdminControlSnapshot thrown forced repair connection failure preserves a metric-moving fallback',
    async (t) => {
      const buildOptions = [];
      let repairOptions = null;
      let sharedOwnerRepairCalls = 0;
      const localSnapshot = {
        nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
        },
      };
      const repairFailure = new Error(
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL,
      );
      const snapshot = new AdminControlSnapshot({
        nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
        serviceDiscovery: {
          async ensureAuthoritativeDiscoveryCacheRepair() {
            sharedOwnerRepairCalls += 1;
            throw new Error('shared owner force repair should stay deferred');
          },
        },
      });
      snapshot.buildLocalControlSnapshot = async (options = {}) => {
        buildOptions.push(options);
        if (buildOptions.length === 1) {
          throw new Error(
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
          );
        }
        if (
          options[
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
          ] === true ||
          options[
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
          ] === true ||
          options[
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
          ] === true
        ) {
          throw new Error(
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
          );
        }
        return localSnapshot;
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
            missingNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS,
            ],
          },
        },
      });
      snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
        repairOptions = options;
        throw repairFailure;
      };

      const result = await snapshot.resolveLocalControlSnapshot({
        forceAuthoritativeRepair: true,
        allowAuthoritativeRepair: true,
        queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      });

      t.equal(
        buildOptions.length,
        2,
        'thrown forced repair failure should retry once from the local cache',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
        ],
        false,
        'fallback should exit forced repair before reading the local cache',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
        ],
        false,
        'fallback should not allow another authoritative repair while repair is deferred',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
        ],
        false,
        'fallback should not repeat the failed authoritative publication read',
      );
      t.equal(
        repairOptions?.queryTimeoutMs,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
        'forced thrown repair should reserve caller query time for the local fallback',
      );
      t.equal(
        sharedOwnerRepairCalls,
        0,
        'the shared snapshot owner should not retry force repair after the thrown participant failure',
      );
      t.same(
        result.nodes,
        [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
        'thrown participant failure should keep snapshot coverage above two-of-five',
      );
      t.match(
        result,
        {
          observationMode:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
          snapshotObservation: {
            state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
            contractState:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
            nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
            reasonCodes: [
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
            ],
          },
          adminObservation: {
            repair: {
              forced: true,
              deferred: true,
              applied: false,
            },
          },
          controlPlaneDiagnostics: {
            ordinaryRepairDeferred: true,
          },
        },
        'thrown connection-closed repair failure should become a structured deferred snapshot',
      );
    });

  test('AdminControlSnapshot forced repair uses projected fallback coverage under query pressure',
    async (t) => {
      const buildOptions = [];
      const projectedFallbackSnapshot = {
        nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_UNUSABLE_LOCAL_NODE_IDS],
        projectedNodes: [
          ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS,
        ],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
        },
      };
      const repairFailure = {
        applied: false,
        skipped: false,
        failedTables: [TABLES.NODES],
        errors: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL,
        ],
        causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
        firstFailedParticipant: {
          failedTable: TABLES.NODES,
          participantNodeId:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
          errorCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
          error: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
      });
      snapshot.buildLocalControlSnapshot = async (options = {}) => {
        buildOptions.push(options);
        return projectedFallbackSnapshot;
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
            missingNodeIds: [
              ...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_GAP_NODE_IDS,
            ],
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

      t.equal(
        buildOptions.length,
        1,
        'projected fallback coverage should preserve the already built local snapshot',
      );
      t.same(
        result.nodes,
        [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
          (left, right) => left.localeCompare(right),
        ),
        'deferred repair should promote projected fallback coverage above two-of-five',
      );
      t.same(
        result.projectedNodes,
        [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS].sort(
          (left, right) => left.localeCompare(right),
        ),
        'deferred repair should keep projected fallback coverage visible to probes',
      );
      t.match(
        result,
        {
          observationMode:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
          snapshotObservation: {
            state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
            contractState:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
            nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
          },
          adminObservation: {
            repair: {
              forced: true,
              deferred: true,
              applied: false,
            },
          },
          controlPlaneDiagnostics: {
            ordinaryRepairDeferred: true,
          },
        },
        'projected forced repair pressure should become a structured deferred snapshot',
      );
    });

  test('AdminControlSnapshot forced publication read failure preserves a metric-moving local fallback',
    async (t) => {
      const buildOptions = [];
      let repairOptions = null;
      let sharedOwnerRepairCalls = 0;
      const localSnapshot = {
        nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
        },
      };
      const repairFailure = {
        applied: false,
        skipped: false,
        failedTables: [TABLES.NODES],
        errors: [
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_DETAIL,
        ],
        causeChain: [ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CAUSE],
        firstFailedParticipant: {
          failedTable: TABLES.NODES,
          participantNodeId:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_NODE_ID,
          errorCode: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_FAILURE_CODE,
          error: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_PARTICIPANT_CONNECTION_FAILURE,
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
        serviceDiscovery: {
          async ensureAuthoritativeDiscoveryCacheRepair() {
            sharedOwnerRepairCalls += 1;
            throw new Error('shared owner force repair should stay deferred');
          },
        },
      });
      snapshot.buildLocalControlSnapshot = async (options = {}) => {
        buildOptions.push(options);
        if (buildOptions.length === 1) {
          throw new Error(
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
          );
        }
        if (
          options[
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
          ] === true ||
          options[
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
          ] === true ||
          options[
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
          ] === true
        ) {
          throw new Error(
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_RECOVERABLE_PUBLICATION_READ_ERROR,
          );
        }
        return localSnapshot;
      };
      snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
      snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
        shouldRepair: true,
        triggerCodes: ['discovery_node_coverage_gap'],
        nodeCoverage: {
          activeProjection: {
            hasCoverageGap: true,
            missingNodeIds: ['node-4', 'node-5'],
          },
        },
      });
      snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
        repairOptions = options;
        return repairFailure;
      };

      const result = await snapshot.resolveLocalControlSnapshot({
        forceAuthoritativeRepair: true,
        allowAuthoritativeRepair: true,
        queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      });

      t.equal(
        buildOptions.length,
        2,
        'forced publication read failure should retry once from the local cache',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_FORCE_AUTHORITATIVE_REPAIR
        ],
        false,
        'fallback should exit forced repair before retrying the local cache',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_REPAIR
        ],
        false,
        'fallback should not allow another authoritative repair while repair is deferred',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_PREFER_AUTHORITATIVE_PUBLICATION_READ
        ],
        false,
        'fallback should not repeat the failed authoritative publication read',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_ALLOW_AUTHORITATIVE_READINESS_REFRESH
        ],
        false,
        'fallback should not open a readiness refresh side path',
      );
      t.equal(
        buildOptions[1][
          ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_OPTION_RECONCILE_AUTHORITATIVE_PUBLICATION
        ],
        false,
        'fallback should not reconcile publication while repair is deferred',
      );
      t.equal(
        repairOptions?.queryTimeoutMs,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
        'forced pre-snapshot repair should reserve caller query time for the local fallback',
      );
      t.equal(
        sharedOwnerRepairCalls,
        0,
        'the shared snapshot owner should not retry force repair after the fallback is marked deferred',
      );
      t.same(
        result.nodes,
        [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
        'deferred forced repair should keep the metric-moving local fallback',
      );
      t.match(
        result,
        {
          observationMode:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
          adminObservation: {
            repair: {
              forced: true,
              deferred: true,
              applied: false,
            },
          },
          controlPlaneDiagnostics: {
            ordinaryRepairDeferred: true,
          },
        },
        'forced publication read repair failure should become a structured deferred owner observation',
      );
    });

  test('AdminControlSnapshot forced query timeout preserves metric-moving local snapshot',
    async (t) => {
      const buildOptions = [];
      let sharedOwnerRepairCalls = 0;
      let repairOptions = null;
      const localSnapshot = {
        nodes: [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
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
      });
      snapshot.controlPlaneSnapshotOwner = new ControlPlaneSnapshotOwner({
        controlSnapshot: snapshot,
        serviceDiscovery: {
          async ensureAuthoritativeDiscoveryCacheRepair() {
            sharedOwnerRepairCalls += 1;
            throw new Error('shared owner force repair should stay deferred');
          },
        },
      });
      snapshot.buildLocalControlSnapshot = async (options = {}) => {
        buildOptions.push(options);
        return localSnapshot;
      };
      snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
      snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
        shouldRepair: true,
        triggerCodes: ['discovery_node_coverage_gap'],
        nodeCoverage: {
          activeProjection: {
            hasCoverageGap: true,
            missingNodeIds: ['node-4', 'node-5'],
          },
        },
      });
      snapshot.ensureAuthoritativeDiscoveryCacheRepair = async (options = {}) => {
        repairOptions = options;
        return repairFailure;
      };

      const result = await snapshot.resolveLocalControlSnapshot({
        forceAuthoritativeRepair: true,
        allowAuthoritativeRepair: true,
        queryTimeoutMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
      });

      t.equal(
        buildOptions.length,
        1,
        'query timeout should preserve the already built local snapshot',
      );
      t.equal(
        sharedOwnerRepairCalls,
        0,
        'the shared snapshot owner should not retry force repair after a deferred query timeout',
      );
      t.equal(
        repairOptions?.queryTimeoutMs,
        ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_FORCED_REPAIR_QUERY_TIMEOUT_MS,
        'forced repair should reserve caller query time for returning the metric-moving local snapshot',
      );
      t.same(
        result.nodes,
        [...ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DEFERRED_REPAIR_NODE_IDS],
        'deferred query timeout should keep metric-moving snapshot coverage',
      );
      t.match(
        result,
        {
          observationMode:
            ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_OBSERVATION_MODE,
          snapshotObservation: {
            state: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_STATE,
            contractState:
              ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_CONTRACT_STATE,
            nextAction: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_REPAIR_DEFERRED_NEXT_ACTION,
            reasonCodes: [
              ACTIVE_GATE_SNAPSHOT_TEST_STATE
                .ACTIVE_GATE_SNAPSHOT_DISCOVERY_NODE_COVERAGE_GAP_TRIGGER,
              TEST_SELECTED_SNAPSHOT_TIMEOUT_REASON,
            ],
            retryAfterMs: ACTIVE_GATE_SNAPSHOT_TEST_STATE.ACTIVE_GATE_SNAPSHOT_DIRECT_QUERY_TIMEOUT_MS,
          },
          adminObservation: {
            repair: {
              forced: true,
              deferred: true,
              applied: false,
            },
          },
          controlPlaneDiagnostics: {
            ordinaryRepairDeferred: true,
            publicationActiveGateHandoff: {
              pendingRecoveryNodeIds: [
                ACTIVE_GATE_SNAPSHOT_TEST_STATE
                  .ACTIVE_GATE_SNAPSHOT_TIMEOUT_SELECTED_SOURCE_NODE_ID,
              ],
              pendingRecoveryCount: 1,
              runtimePromotionAllowed: false,
              state:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE
                  .ACTIVE_GATE_OWNER_COHORT_STATE_PENDING,
              reasonCode:
                ACTIVE_GATE_SNAPSHOT_TEST_STATE
                  .ACTIVE_GATE_OWNER_COHORT_REASON_OWNER_RECONCILE_PENDING,
              nextAction:
                TEST_ACTIVE_GATE_HANDOFF_NEXT_ACTION_WAIT_OWNER_RECOVERY,
            },
          },
        },
        'forced query timeout should become a structured deferred owner observation',
      );
    });
}
