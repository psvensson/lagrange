import {test} from '../../src/test-helpers/tap.js';
import {
  RUNTIME_GRAMMAR_HOTSPOT_CONTRACTS,
  collectRuntimeGrammarContractViolationsFromSource,
} from '../../scripts/check-runtime-grammar-contracts.js';

const STRICT_CONSISTENCY_FILE_PATH =
  'test/distributed/harness/assertions-segment-1.js';
const UNIFIED_REBALANCER_FILE_PATH =
  'src/rebalancer/unified-rebalancer-lifecycle-base.js';
const MOVE_PLANNER_FILE_PATH = 'src/rebalancer/move-planner.js';
const OPERATION_WORKFLOW_OWNER_SEGMENT_5_FILE_PATH =
  'src/rebalancer/operation-workflow-owner-segment-5.js';
const PUBLICATION_COORDINATOR_FILE_PATH =
  'src/control-plane/membership-publication-coordinator.js';
const PUBLICATION_RECOVERY_GATE_FILE_PATH =
  'src/control-plane/publication-recovery-gate.js';
const READINESS_SERVICE_SEGMENT_4_FILE_PATH =
  'src/control-plane/control-plane-readiness-publication-aware.js';
const ADMIN_WEBSOCKET_API_SEGMENT_2_FILE_PATH =
  'src/admin/admin-websocket-load-lane-admission.js';
const NON_HOTSPOT_FILE_PATH = 'src/runtime/plain-helper.js';
const CLUSTER_SEGMENT_2_FILE_PATH =
  'test/distributed/harness/cluster-segment-2.js';
const PUBLICATION_EVIDENCE_REPLAY_FILE_PATH =
  'test/distributed/harness/publication-evidence-replay.js';
const STATE_MACHINE_PRESSURE_PREFLIGHT_FILE_PATH =
  'test/distributed/harness/state-machine-pressure-preflight.js';
const DISTRIBUTED_RUN_RUNTIME_HELPERS_FILE_PATH =
  'test/distributed/run-runtime-helpers.js';
const EXTRACT_LEADERS_FUNCTION = 'extractControlSnapshotLeaders';
const HANDLE_COORDINATOR_PROGRESS_FUNCTION = 'handleCoordinatorProgressEvent';
const CALCULATE_MOVES_FUNCTION = 'calculateMoves';
const RESOLVE_PRIORITY_PUBLICATION_SOURCE_ROLE_STATE_FUNCTION =
  'resolvePriorityPublicationSourceRoleState';
const BUILD_PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_SNAPSHOT_FUNCTION =
  'buildPriorityPublicationLeaderRemoveSafetySnapshot';
const BUILD_PRIORITY_RECOVERY_PLANNING_PROJECTION_FUNCTION =
  'buildPriorityRecoveryPlanningProjection';
const RESOLVE_LOAD_LANE_READINESS_SNAPSHOT_FUNCTION =
  'resolveLoadLaneReadinessSnapshot';
const EVALUATE_LOAD_PUBLISHED_CONVERGENCE_FUNCTION =
  'evaluateLoadPublishedConvergence';
const REPLAY_PUBLICATION_PRIORITY_EVIDENCE_FROM_ROWS_FUNCTION =
  'replayPublicationPriorityEvidenceFromRows';
const RUN_SCENARIOS_FUNCTION = 'runScenarios';
const BIND_PRIORITY_VISIBILITY_FUNCTION =
  'bindPriorityRecoveryVisibilityCacheListener';
const BUILD_PRIORITY_SPREAD_DECISION_FUNCTION = 'buildPrioritySpreadDecision';
const FORBIDDEN_REPLICA_ROLES_FRAGMENT = 'replicaRoles';
const MEMBERSHIP_PUBLICATION_WAKEUP_FRAGMENT =
  'enqueueMembershipPublicationReconcile';
const MERGE_PLANNING_EVIDENCE_FRAGMENT = 'mergePlanningEvidenceRows';
const PRIORITY_RECOVERY_SPREAD_GAP_FRAGMENT = 'hasPriorityRecoverySpreadGap';
const CACHE_VISIBILITY_SUBSCRIPTION_FRAGMENT = 'systemTableCache.onCacheChange';
const PRIORITY_STANDALONE_REMOVE_FRAGMENT = 'prioritySpreadStandaloneSafe';
const PRIORITY_RECOVERY_REASON_GATE_FILTER_FRAGMENT =
  'filterPriorityRecoveryReasonCodesForPublicationGate';
const REQUIRE_FRESH_ON_INELIGIBLE_FRAGMENT =
  'requireFreshOnIneligible: true';
const PRIORITY_RECOVERY_CLOSURE_WITNESS_FRAGMENT =
  'priorityRecoveryClosureWitness:';
const BUILD_PRIORITY_CLOSURE_WITNESS_COMPARISON_FRAGMENT =
  'buildPriorityClosureWitnessComparison';
const COMPLETED_LEADER_HANDOFF_EVIDENCE_FRAGMENT =
  'completedLeaderHandoffEvidence';
const WAIT_REPLACEMENT_LEADER_OWNERSHIP_FRAGMENT =
  'WAIT_REPLACEMENT_LEADER_OWNERSHIP';
const STATE_MACHINE_PRESSURE_PREFLIGHT_GRAMMAR_FRAGMENT =
  'STATE_MACHINE_PRESSURE_POINT_GRAMMAR';
const STATE_MACHINE_PRESSURE_PREFLIGHT_METADATA_FRAGMENT =
  'STATE_MACHINE_PRESSURE_PREFLIGHT_METADATA_KEY';

test('detects forbidden strict leader inference fragments inside leader extraction',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'function extractControlSnapshotLeaders(snapshot) {',
        '  const leaders = new Map();',
        '  const leaderMap = snapshot?.[CONTROL_SNAPSHOT_FIELD_LEADERS];',
        '  const fallback = snapshot?.replicaRoles;',
        '  return leaders;',
        '}',
      ].join('\n'),
      STRICT_CONSISTENCY_FILE_PATH,
    );

    t.equal(violations.length, 1);
    t.equal(violations[0].functionName, EXTRACT_LEADERS_FUNCTION);
    t.equal(violations[0].target, FORBIDDEN_REPLICA_ROLES_FRAGMENT);
  });

test('accepts strict leader extraction that reads only canonical leaders',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'function extractControlSnapshotLeaders(snapshot) {',
        '  const leaders = new Map();',
        '  const leaderMap = snapshot?.[CONTROL_SNAPSHOT_FIELD_LEADERS];',
        '  return leaders;',
        '}',
      ].join('\n'),
      STRICT_CONSISTENCY_FILE_PATH,
    );

    t.equal(violations.length, 0);
  });

test('detects priority progress handlers that skip publication owner wakeup',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'const reason = RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS;',
        'class UnifiedRebalancer {',
        '  handleCoordinatorProgressEvent() {',
        '    this.enqueueRebalanceCheck(reason);',
        '    return true;',
        '  }',
        '  handlePriorityRecoveryVisibilityEvent() {',
        '    this.enqueueRebalanceCheck(reason);',
        '    this.enqueueMembershipPublicationReconcile(reason);',
        '    return true;',
        '  }',
        '}',
      ].join('\n'),
      UNIFIED_REBALANCER_FILE_PATH,
    );

    t.ok(
      violations.some((violation) =>
        violation.functionName === HANDLE_COORDINATOR_PROGRESS_FUNCTION &&
        violation.target === MEMBERSHIP_PUBLICATION_WAKEUP_FRAGMENT,
      ),
    );
  });

test('detects priority visibility handlers that are not wired to cache changes',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'const reason = RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS;',
        'class UnifiedRebalancer {',
        '  constructor() {',
        '    this.priorityRecoveryVisibilityCacheListener = null;',
        '  }',
        '  bindPriorityRecoveryVisibilityCacheListener() {',
        '    return;',
        '  }',
        '  unbindPriorityRecoveryVisibilityCacheListener() {',
        '    systemTableCache.offCacheChange(listener);',
        '  }',
        '  handleCoordinatorProgressEvent() {',
        '    this.enqueueRebalanceCheck(reason);',
        '    this.enqueueMembershipPublicationReconcile(reason);',
        '    return true;',
        '  }',
        '  handlePriorityRecoveryVisibilityEvent() {',
        '    this.enqueueRebalanceCheck(reason);',
        '    this.enqueueMembershipPublicationReconcile(reason);',
        '    return true;',
        '  }',
        '}',
      ].join('\n'),
      UNIFIED_REBALANCER_FILE_PATH,
    );

    t.ok(
      violations.some((violation) =>
        violation.functionName === BIND_PRIORITY_VISIBILITY_FUNCTION &&
        violation.target === CACHE_VISIBILITY_SUBSCRIPTION_FRAGMENT,
      ),
    );
  });

test('detects priority planner code that does not tag standalone remove safety',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'class MovePlanner {',
        '  calculateMoves() {',
        '    if (addMoves.length === NUM.ZERO) {',
        '      this.analyzePrioritySpread(replicas, policy, nodes);',
        '    }',
        '    return candidateRemoves;',
        '  }',
        '}',
      ].join('\n'),
      MOVE_PLANNER_FILE_PATH,
    );

    t.ok(
      violations.some((violation) =>
        violation.functionName === CALCULATE_MOVES_FUNCTION &&
        violation.target === PRIORITY_STANDALONE_REMOVE_FRAGMENT,
      ),
    );
  });

test('detects publication planning code that drops merged evidence', async (t) => {
  const violations = collectRuntimeGrammarContractViolationsFromSource(
    [
      'const readProfile = MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING;',
      'function shouldMergePlanningEvidenceRows() { return true; }',
      'class MembershipPublicationCoordinator {',
      '  readTableRows() {',
      '    return this.systemTableCache.getAll(tableName) || [];',
      '  }',
      '  readPublicationPlanningSnapshot() {',
      '    return {readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING};',
      '  }',
      '}',
    ].join('\n'),
    PUBLICATION_COORDINATOR_FILE_PATH,
  );

  t.equal(violations.length, 2);
  t.same(
    violations.map((violation) => violation.target).sort(),
    [
      MERGE_PLANNING_EVIDENCE_FRAGMENT,
      MERGE_PLANNING_EVIDENCE_FRAGMENT,
    ],
  );
});

test('detects publication recovery gate code that skips summary authority',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'const hasPriorityRecoverySpreadGap = true;',
        'const PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE = {};',
        'function filterProvidedPriorityRecoveryReasonCodes() { return []; }',
        'function buildPrioritySpreadDecision(options) {',
        '  return {prioritySpreadPending: options.reasonCodes.length > 0};',
        '}',
        'function buildPublicationRecoveryGateSnapshot() {',
        '  const prioritySpreadDecision = buildPrioritySpreadDecision({});',
        '  const prioritySpreadPending = prioritySpreadDecision.prioritySpreadPending;',
        '  return {priorityPartitionSummary: prioritySpreadDecision.priorityPartitionSummary};',
        '}',
      ].join('\n'),
      PUBLICATION_RECOVERY_GATE_FILE_PATH,
    );

    t.ok(
      violations.some((violation) =>
        violation.functionName === BUILD_PRIORITY_SPREAD_DECISION_FUNCTION &&
        violation.target === PRIORITY_RECOVERY_SPREAD_GAP_FRAGMENT,
      ),
    );
  });

test('detects missing state-machine pressure preflight grammar', async (t) => {
  const violations = collectRuntimeGrammarContractViolationsFromSource(
    [
      'function evaluateStaticPressurePointGrammar() { return []; }',
      'function evaluateStateMachinePressureSnapshot() { return {}; }',
      'function runStateMachinePressurePreflight() { return {}; }',
    ].join('\n'),
    STATE_MACHINE_PRESSURE_PREFLIGHT_FILE_PATH,
  );

  t.ok(
    violations.some((violation) =>
      violation.target === STATE_MACHINE_PRESSURE_PREFLIGHT_GRAMMAR_FRAGMENT,
    ),
  );
});

test('detects distributed runner paths that skip pressure preflight metadata',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'async function runScenarios(config, scenarios, options) {',
        '  const report = new ReportWriter(options.output, {});',
        '  return {report, hasFailures: false};',
        '}',
      ].join('\n'),
      DISTRIBUTED_RUN_RUNTIME_HELPERS_FILE_PATH,
    );

    t.ok(
      violations.some((violation) =>
        violation.functionName === RUN_SCENARIOS_FUNCTION &&
        violation.target === STATE_MACHINE_PRESSURE_PREFLIGHT_METADATA_FRAGMENT,
      ),
    );
  });

test('detects readiness planning code that reintroduces stale priority-spread reasons',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'class ControlPlaneReadinessService {',
        '  buildPriorityRecoveryPlanningProjection(planningSnapshot) {',
        '    const publicationRecoveryGate = planningSnapshot.publicationRecoveryGate;',
        '    const priorityRecoveryReasonCodes = Object.freeze([',
        '      ...publicationRecoveryGate.reasonCodes,',
        '      ...planningSnapshot.priorityRecoveryReasonCodes,',
        '    ]);',
        '    return {priorityRecoveryReasonCodes};',
        '  }',
        '}',
      ].join('\n'),
      READINESS_SERVICE_SEGMENT_4_FILE_PATH,
    );

    t.ok(
      violations.some((violation) =>
        violation.functionName ===
          BUILD_PRIORITY_RECOVERY_PLANNING_PROJECTION_FUNCTION &&
        violation.target === PRIORITY_RECOVERY_REASON_GATE_FILTER_FRAGMENT,
      ),
    );
  });

test('detects load-lane readiness callers that reuse cached ineligible snapshots',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'class AdminWebSocketAPI {',
        '  async resolveLoadLaneReadinessSnapshot() {',
        '    return this.controlPlaneReadinessService.getStartupAuthoritySnapshot({',
        '      preferBackgroundRefreshOnIneligible: true,',
        '    });',
        '  }',
        '}',
      ].join('\n'),
      ADMIN_WEBSOCKET_API_SEGMENT_2_FILE_PATH,
    );

    t.ok(
      violations.some((violation) =>
        violation.functionName ===
          RESOLVE_LOAD_LANE_READINESS_SNAPSHOT_FUNCTION &&
        violation.target === REQUIRE_FRESH_ON_INELIGIBLE_FRAGMENT,
      ),
    );
  });

test('detects load convergence code that drops decision closure witness evidence',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'function evaluateLoadPublishedConvergence(snapshotCoverage) {',
        '  const publicationRecoveryGate = buildPublicationRecoveryGateSnapshot({',
        '    publicationStatus: snapshotCoverage?.publicationStatus,',
        '  });',
        '  return {',
        '    publicationRecoveryGate,',
        '    closureRecordId: publicationRecoveryGate?.closureRecordId || null,',
        '  };',
        '}',
      ].join('\n'),
      CLUSTER_SEGMENT_2_FILE_PATH,
    );

    t.ok(
      violations.some((violation) =>
        violation.functionName ===
          EVALUATE_LOAD_PUBLISHED_CONVERGENCE_FUNCTION &&
        violation.target === PRIORITY_RECOVERY_CLOSURE_WITNESS_FRAGMENT,
      ),
    );
  });

test('detects replay tooling that omits closure witness classification',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'function replayPublicationPriorityEvidenceFromRows() {',
        '  const candidate = deriveMembershipPublicationCandidate({});',
        '  return {',
        '    replayedPublication: {summary: candidate.priorityPartitionSummary},',
        '    comparison: buildPrioritySummaryComparison({}, {}),',
        '  };',
        '}',
      ].join('\n'),
      PUBLICATION_EVIDENCE_REPLAY_FILE_PATH,
    );

    t.ok(
      violations.some((violation) =>
        violation.functionName ===
          REPLAY_PUBLICATION_PRIORITY_EVIDENCE_FROM_ROWS_FUNCTION &&
        violation.target === BUILD_PRIORITY_CLOSURE_WITNESS_COMPARISON_FRAGMENT,
      ),
    );
  });

test('detects priority source removal code that collapses handoff evidence into leader closure',
  async (t) => {
    const violations = collectRuntimeGrammarContractViolationsFromSource(
      [
        'class OperationWorkflowOwner {',
        '  resolvePriorityPublicationSourceRoleState() {',
        '    const completedLeaderHandoffEvidence = true;',
        '    if (completedLeaderHandoffEvidence) {',
        '      return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.FOLLOWER;',
        '    }',
        '    return PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.UNKNOWN;',
        '  }',
        '  buildPriorityPublicationLeaderRemoveSafetySnapshot() {',
        '    return {',
        '      state: PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_SOURCE_LEADER_HANDOFF,',
        '    };',
        '  }',
        '  evaluatePriorityPublicationLeaderRemoveSafety() {',
        '    return this.buildDeferredRemoveSafetyEvaluationForOperation();',
        '  }',
        '}',
      ].join('\n'),
      OPERATION_WORKFLOW_OWNER_SEGMENT_5_FILE_PATH,
    );

    t.ok(
      violations.some((violation) =>
        violation.functionName ===
          RESOLVE_PRIORITY_PUBLICATION_SOURCE_ROLE_STATE_FUNCTION &&
        violation.target === COMPLETED_LEADER_HANDOFF_EVIDENCE_FRAGMENT,
      ),
    );
    t.ok(
      violations.some((violation) =>
        violation.functionName ===
          BUILD_PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_SNAPSHOT_FUNCTION &&
        violation.target === WAIT_REPLACEMENT_LEADER_OWNERSHIP_FRAGMENT,
      ),
    );
  });

test('ignores non-hotspot files', async (t) => {
  const violations = collectRuntimeGrammarContractViolationsFromSource(
    [
      'export function helper() {',
      '  return {ok: true};',
      '}',
    ].join('\n'),
    NON_HOTSPOT_FILE_PATH,
  );

  t.equal(violations.length, 0);
});

test('tracks the bounded runtime grammar hotspot set explicitly', async (t) => {
  t.same(
    Object.keys(RUNTIME_GRAMMAR_HOTSPOT_CONTRACTS).sort(),
    [
      'src/admin/admin-websocket-load-lane-admission.js',
      'src/control-plane/control-plane-readiness-publication-aware.js',
      'src/control-plane/membership-publication-coordinator.js',
      'src/control-plane/publication-recovery-gate.js',
      'src/node/replica-handler-remove-execution-methods.js',
      'src/node/replica-handler-remove-request-methods.js',
      'src/rebalancer/move-planner.js',
      'src/rebalancer/operation-workflow-owner-segment-2.js',
      'src/rebalancer/operation-workflow-owner-segment-5.js',
      'src/rebalancer/unified-rebalancer-lifecycle-base.js',
      'test/distributed/harness/assertions-segment-1.js',
      'test/distributed/harness/assertions-segment-3.js',
      'test/distributed/harness/cluster-segment-2.js',
      'test/distributed/harness/publication-evidence-replay.js',
      'test/distributed/harness/state-machine-pressure-preflight.js',
      'test/distributed/run-runtime-helpers.js',
      'test/distributed/run.js',
    ],
  );
});
