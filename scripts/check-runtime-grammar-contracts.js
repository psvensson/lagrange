import path from 'node:path';
import process from 'node:process';
import {
  buildGuidelineViolationReport,
  formatGuidelineHumanSummary,
  parseSourceFile,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
  walkAst,
} from './guideline-check-shared.js';

const RULES_MD = 'docs/steering/rules.md ';
const RULE_REFERENCE =
  `${RULES_MD}R07. A semantic outcome is a named state, and ` +
  'architecture/current-owner-maps.md';

const VIOLATION_KIND = Object.freeze({
  FORBIDDEN_FRAGMENT: 'runtime_grammar_forbidden_fragment',
  MISSING_FUNCTION: 'runtime_grammar_missing_function',
  REQUIRED_FRAGMENT: 'runtime_grammar_required_fragment_missing',
});

const AST_NODE_TYPE = Object.freeze({
  FUNCTION_DECLARATION: 'FunctionDeclaration',
  IDENTIFIER: 'Identifier',
  LITERAL: 'Literal',
  METHOD_DEFINITION: 'MethodDefinition',
});

const RUNTIME_GRAMMAR_TEXT = Object.freeze({
  EMPTY: '',
  PATH_SEPARATOR: '/',
  REQUIRED_FRAGMENT_MISSING:
    'runtime grammar hotspot no longer contains required contract fragment ',
  FORBIDDEN_FRAGMENT_PRESENT:
    'runtime grammar hotspot contains forbidden alternate-route fragment ',
  SUMMARY_LABEL: 'runtime-grammar-contract',
});

const SOURCE_RANGE_INDEX = Object.freeze({
  START: 0,
  END: 1,
});

const POSITION_DEFAULT = 1;
const PROCESS_ARG_OFFSET = 2;
const EMPTY_LENGTH = 0;

const CONTRACT_FIELD = Object.freeze({
  FORBIDDEN_FRAGMENTS: 'forbiddenFragments',
  FUNCTION_CONTRACTS: 'functionContracts',
  REQUIRED_FRAGMENTS: 'requiredFragments',
});

const RUNTIME_GRAMMAR_HOTSPOT_CONTRACTS = Object.freeze({
  'test/distributed/harness/assertions-control-snapshot-extraction.js': Object.freeze({
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'extractControlSnapshotLeaders',
        requiredFragments: Object.freeze([
          'CONTROL_SNAPSHOT_FIELD_LEADERS',
        ]),
        forbiddenFragments: Object.freeze([
          'CONTROL_SNAPSHOT_FIELD_REPLICA_ROLES',
          'CONTROL_SNAPSHOT_FIELD_REPLICA_ROLE_DIAGNOSTICS',
          'replicaRoles',
          'replicaRoleDiagnostics',
        ]),
      }),
    ]),
  }),
  'test/distributed/harness/assertions-consistency-comparison.js': Object.freeze({
    requiredFragments: Object.freeze([
      'extractPublicationRecoveryGateContract',
      'CONSISTENCY_REASON_CODE_PUBLICATION_RECOVERY_GATE_NOT_READY',
      'buildPublicationRecoveryGateNotReadyMessage',
      'publicationRecoveryGate',
    ]),
  }),
  'src/control-plane/publication-recovery-priority-spread.js': Object.freeze({
    requiredFragments: Object.freeze([
      'hasPriorityRecoverySpreadGap',
      'PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE',
    ]),
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'buildPrioritySpreadDecision',
        requiredFragments: Object.freeze([
          'hasPriorityRecoverySpreadGap',
          'PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.PRIORITY_PARTITION_SUMMARY',
          'PUBLICATION_PRIORITY_SPREAD_DECISION_SOURCE.OWNER_EVIDENCE_UNAVAILABLE',
          'prioritySpreadEvidenceUnavailable',
          'prioritySpreadPending',
        ]),
      }),
    ]),
  }),
  'src/control-plane/publication-recovery-gate.js': Object.freeze({
    requiredFragments: Object.freeze([
      'filterProvidedPriorityRecoveryReasonCodes',
    ]),
    functionContracts: Object.freeze([
      Object.freeze({
        // The public name is a thin sync-section wrapper (quest
        // publication-recovery-snapshot-starvation-relief); the contract
        // chain is wrapper -> Untracked body -> grammar helpers, so the
        // wrapper must delegate and the body carries the helper fragments.
        functionName: 'buildPublicationRecoveryGateSnapshot',
        requiredFragments: Object.freeze([
          'buildPublicationRecoveryGateSnapshotUntracked',
        ]),
      }),
      Object.freeze({
        functionName: 'buildPublicationRecoveryGateSnapshotUntracked',
        requiredFragments: Object.freeze([
          'buildPrioritySpreadDecision',
          'filterProvidedPriorityRecoveryReasonCodes',
          'prioritySpreadDecision.prioritySpreadPending',
          'prioritySpreadDecision.priorityPartitionSummary',
        ]),
      }),
    ]),
  }),
  'src/control-plane/control-plane-readiness-publication-aware.js': Object.freeze({
    requiredFragments: Object.freeze([
      'filterPriorityRecoveryReasonCodesForPublicationGate',
    ]),
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'filterPriorityRecoveryReasonCodesForPublicationGate',
        requiredFragments: Object.freeze([
          'CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD',
          'publicationRecoveryGate?.prioritySpreadPending !== true',
        ]),
      }),
      Object.freeze({
        functionName: 'buildPriorityRecoveryPlanningProjection',
        requiredFragments: Object.freeze([
          'filterPriorityRecoveryReasonCodesForPublicationGate',
          'publicationRecoveryGate',
        ]),
      }),
    ]),
  }),
  'src/admin/admin-websocket-load-lane-admission.js': Object.freeze({
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'resolveLoadLaneReadinessSnapshot',
        requiredFragments: Object.freeze([
          'requireFreshOnIneligible: true',
        ]),
        forbiddenFragments: Object.freeze([
          'preferBackgroundRefreshOnIneligible: true',
        ]),
      }),
    ]),
  }),
  'src/rebalancer/unified-rebalancer-lifecycle-base.js': Object.freeze({
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'constructor',
        requiredFragments: Object.freeze([
          'bindPriorityRecoveryVisibilityCacheListener',
        ]),
      }),
    ]),
  }),
  'src/rebalancer/unified-rebalancer-priority-recovery-coordination.js': Object.freeze({
    requiredFragments: Object.freeze([
      'bindPriorityRecoveryVisibilityCacheListener',
      'unbindPriorityRecoveryVisibilityCacheListener',
      'RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS',
    ]),
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'bindPriorityRecoveryVisibilityCacheListener',
        requiredFragments: Object.freeze([
          'systemTableCache.onCacheChange',
          'handlePriorityRecoveryVisibilityEvent',
        ]),
      }),
      Object.freeze({
        functionName: 'unbindPriorityRecoveryVisibilityCacheListener',
        requiredFragments: Object.freeze([
          'systemTableCache.offCacheChange',
        ]),
      }),
      Object.freeze({
        functionName: 'handleCoordinatorProgressEvent',
        requiredFragments: Object.freeze([
          'enqueueRebalanceCheck',
          'enqueueMembershipPublicationReconcile',
        ]),
      }),
      Object.freeze({
        functionName: 'buildCoordinatorProgressRebalanceDecision',
        requiredFragments: Object.freeze([
          'operationPriorityPartition',
          'isPriorityControlPlanePartition',
        ]),
      }),
      Object.freeze({
        functionName: 'handlePriorityRecoveryVisibilityEvent',
        requiredFragments: Object.freeze([
          'enqueueRebalanceCheck',
          'enqueueMembershipPublicationReconcile',
        ]),
      }),
    ]),
  }),
  'src/rebalancer/move-planner-move-calculation-methods.js': Object.freeze({
    requiredFragments: Object.freeze([
      'buildPriorityStandaloneRemoveSafety',
      'prioritySpreadStandaloneSafe',
    ]),
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'calculateMoves',
        requiredFragments: Object.freeze([
          'buildPriorityStandaloneRemoveSafety',
          'analyzePrioritySpread',
          'prioritySpreadStandaloneSafe',
          'move.prioritySpreadStandaloneSafe !== false',
        ]),
      }),
    ]),
  }),
  'src/rebalancer/operation-workflow-owner-execution-lane.js': Object.freeze({
    forbiddenFragments: Object.freeze([
      'bypassSingleParticipantSystemWrite',
      'recoverTransitionExecutionSession',
      'transactionCoordinator',
    ]),
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'buildOperationTransitionPersistOptions',
        requiredFragments: Object.freeze([
          'confirmPersistence: false',
          'disableSystemWriteSession: true',
        ]),
      }),
      Object.freeze({
        functionName: 'confirmCommittedTransitionPersistence',
        requiredFragments: Object.freeze([
          'confirmReplicaOperationPersistence',
          'armTerminalTransitionRepair',
        ]),
      }),
    ]),
  }),
  'src/rebalancer/priority-publication-safety-topology.js': Object.freeze({
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'resolvePriorityPublicationSourceRoleState',
        requiredFragments: Object.freeze([
          'partitionLeaderNodeId === sourceNodeId',
          'PRIORITY_PUBLICATION_SOURCE_ROLE_STATE.LEADER',
        ]),
        forbiddenFragments: Object.freeze([
          'completedLeaderHandoffEvidence',
        ]),
      }),
    ]),
  }),
  'src/rebalancer/priority-publication-leader-safety.js': Object.freeze({
    requiredFragments: Object.freeze([
      'WAIT_REPLACEMENT_LEADER_OWNERSHIP',
    ]),
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'buildPriorityPublicationLeaderRemoveSafetySnapshot',
        requiredFragments: Object.freeze([
          'replacementLeaderOwnershipObserved',
          'partitionLeaderNodeId !== sourceNodeId',
          'WAIT_REPLACEMENT_LEADER_OWNERSHIP',
        ]),
      }),
    ]),
  }),
  'src/rebalancer/priority-publication-handoff.js': Object.freeze({
    requiredFragments: Object.freeze([
      'WAIT_REPLACEMENT_LEADER_OWNERSHIP',
      'REPLACEMENT_LEADER_OWNERSHIP_PENDING_BEFORE_SAFE_REMOVAL',
    ]),
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'evaluatePriorityPublicationLeaderRemoveSafety',
        requiredFragments: Object.freeze([
          'WAIT_REPLACEMENT_LEADER_OWNERSHIP',
          'REPLACEMENT_LEADER_OWNERSHIP_PENDING_BEFORE_SAFE_REMOVAL',
        ]),
      }),
    ]),
  }),
  'src/control-plane/membership-publication-coordinator-reads.js': Object.freeze({
    requiredFragments: Object.freeze([
      'mergePlanningEvidenceRows',
      'shouldMergePlanningEvidenceRows',
    ]),
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'readTableRows',
        requiredFragments: Object.freeze([
          'mergePlanningEvidenceRows',
          'systemTableCache.getAll',
        ]),
      }),
    ]),
  }),
  'src/control-plane/membership-publication-coordinator-planning.js': Object.freeze({
    requiredFragments: Object.freeze([
      'MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING',
    ]),
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'readPublicationPlanningSnapshot',
        requiredFragments: Object.freeze([
          'readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING',
        ]),
      }),
    ]),
  }),
  'src/node/replica-handler-remove-request-methods.js': Object.freeze({
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'handleRemoveReplica',
        requiredFragments: Object.freeze([
          'reconcileRemovedReplicaCleanup',
        ]),
      }),
    ]),
  }),
  'src/node/replica-handler-remove-execution-methods.js': Object.freeze({
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'reconcileRemovedReplicaCleanup',
        requiredFragments: Object.freeze([
          'getPartitionServiceRowOwner().removeReplica',
          'completeDurableRemoval',
        ]),
      }),
    ]),
  }),
  'test/distributed/harness/cluster-active-wait-progress-layer.js': Object.freeze({
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'evaluateLoadPublishedConvergence',
        requiredFragments: Object.freeze([
          'selectedPriorityRecoveryDecisionSnapshots',
          'priorityRecoveryDecisionSnapshots:',
          'priorityRecoveryClosureWitness:',
          'closureRecordId: publicationRecoveryGate?.closureRecordId || null',
        ]),
      }),
    ]),
  }),
  'test/distributed/harness/publication-evidence-replay.js': Object.freeze({
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'replayPublicationPriorityEvidenceFromRows',
        requiredFragments: Object.freeze([
          'candidate.priorityRecoveryClosureWitness',
          'buildPriorityClosureWitnessComparison',
        ]),
      }),
    ]),
  }),
  'test/distributed/harness/state-machine-pressure-preflight.js': Object.freeze({
    requiredFragments: Object.freeze([
      'STATE_MACHINE_PRESSURE_POINT_GRAMMAR',
      'evaluateStaticPressurePointGrammar',
      'evaluateStateMachinePressureSnapshot',
      'runStateMachinePressurePreflight',
      'PUBLICATION_ACK_COMPLETE_NON_TERMINAL',
      'COMPLETED_ACTIVE_OPERATION_ROW',
      'MEMBERSHIP_TRIM_WITH_CLOSED_DRAIN',
      'OVERTARGET_WITH_CLOSED_DRAIN',
    ]),
  }),
  'test/distributed/run.js': Object.freeze({
    requiredFragments: Object.freeze([
      'runStateMachinePressurePreflight',
      './harness/state-machine-pressure-preflight.js',
    ]),
  }),
  'test/distributed/run-runtime-helpers.js': Object.freeze({
    functionContracts: Object.freeze([
      Object.freeze({
        functionName: 'runScenarios',
        requiredFragments: Object.freeze([
          'runStateMachinePressurePreflight',
          'STATE_MACHINE_PRESSURE_PREFLIGHT_METADATA_KEY',
          'stateMachinePressurePreflight.ready !== true',
        ]),
      }),
    ]),
  }),
});

function normalizePath(filePath) {
  return filePath.split(path.sep).join(RUNTIME_GRAMMAR_TEXT.PATH_SEPARATOR);
}

function resolveRuntimeGrammarContract(filePath) {
  return RUNTIME_GRAMMAR_HOTSPOT_CONTRACTS[normalizePath(filePath)] || null;
}

function getPropertyName(key) {
  if (key?.type === AST_NODE_TYPE.IDENTIFIER) {
    return key.name;
  }
  if (key?.type === AST_NODE_TYPE.LITERAL) {
    return String(key.value || RUNTIME_GRAMMAR_TEXT.EMPTY);
  }
  return RUNTIME_GRAMMAR_TEXT.EMPTY;
}

function collectFunctionSourceByName(source) {
  const ast = parseSourceFile(source);
  const functionSourceByName = new Map();
  walkAst(ast, (node) => {
    if (node.type === AST_NODE_TYPE.FUNCTION_DECLARATION &&
        node.id?.type === AST_NODE_TYPE.IDENTIFIER) {
      functionSourceByName.set(
        node.id.name,
        source.slice(
          node.range[SOURCE_RANGE_INDEX.START],
          node.range[SOURCE_RANGE_INDEX.END],
        ),
      );
      return;
    }
    if (node.type === AST_NODE_TYPE.METHOD_DEFINITION) {
      const functionName = getPropertyName(node.key);
      if (functionName.length > EMPTY_LENGTH) {
        functionSourceByName.set(
          functionName,
          source.slice(
            node.range[SOURCE_RANGE_INDEX.START],
            node.range[SOURCE_RANGE_INDEX.END],
          ),
        );
      }
    }
  });
  return functionSourceByName;
}

function buildViolation(filePath, kind, target, reason, functionName = null) {
  return {
    filePath,
    line: POSITION_DEFAULT,
    column: POSITION_DEFAULT,
    kind,
    target,
    ...(functionName ? {functionName} : {}),
    reason,
    ruleReference: RULE_REFERENCE,
  };
}

function collectMissingRequiredFragmentViolations(
  source,
  filePath,
  requiredFragments = [],
  functionName = null,
) {
  return requiredFragments
    .filter((fragment) =>
      !String(source || RUNTIME_GRAMMAR_TEXT.EMPTY).includes(fragment))
    .map((fragment) => buildViolation(
      filePath,
      VIOLATION_KIND.REQUIRED_FRAGMENT,
      fragment,
      RUNTIME_GRAMMAR_TEXT.REQUIRED_FRAGMENT_MISSING +
        `"${fragment}"`,
      functionName,
    ));
}

function collectForbiddenFragmentViolations(
  source,
  filePath,
  forbiddenFragments = [],
  functionName = null,
) {
  return forbiddenFragments
    .filter((fragment) =>
      String(source || RUNTIME_GRAMMAR_TEXT.EMPTY).includes(fragment))
    .map((fragment) => buildViolation(
      filePath,
      VIOLATION_KIND.FORBIDDEN_FRAGMENT,
      fragment,
      RUNTIME_GRAMMAR_TEXT.FORBIDDEN_FRAGMENT_PRESENT +
        `"${fragment}"`,
      functionName,
    ));
}

function collectFunctionContractViolations(source, filePath, functionContracts = []) {
  if (functionContracts.length === EMPTY_LENGTH) {
    return [];
  }
  const functionSourceByName = collectFunctionSourceByName(source);
  const violations = [];
  for (const functionContract of functionContracts) {
    const functionName = functionContract.functionName;
    const functionSource = functionSourceByName.get(functionName);
    if (!functionSource) {
      violations.push(buildViolation(
        filePath,
        VIOLATION_KIND.MISSING_FUNCTION,
        functionName,
        `runtime grammar hotspot function "${functionName}" is missing`,
        functionName,
      ));
      continue;
    }
    violations.push(
      ...collectMissingRequiredFragmentViolations(
        functionSource,
        filePath,
        functionContract[CONTRACT_FIELD.REQUIRED_FRAGMENTS] || [],
        functionName,
      ),
      ...collectForbiddenFragmentViolations(
        functionSource,
        filePath,
        functionContract[CONTRACT_FIELD.FORBIDDEN_FRAGMENTS] || [],
        functionName,
      ),
    );
  }
  return violations;
}

function collectRuntimeGrammarContractViolationsFromSource(source, filePath) {
  const contract = resolveRuntimeGrammarContract(filePath);
  if (!contract) {
    return [];
  }
  return [
    ...collectMissingRequiredFragmentViolations(
      source,
      filePath,
      contract[CONTRACT_FIELD.REQUIRED_FRAGMENTS] || [],
    ),
    ...collectForbiddenFragmentViolations(
      source,
      filePath,
      contract[CONTRACT_FIELD.FORBIDDEN_FRAGMENTS] || [],
    ),
    ...collectFunctionContractViolations(
      source,
      filePath,
      contract[CONTRACT_FIELD.FUNCTION_CONTRACTS] || [],
    ),
  ];
}

async function buildRuntimeGrammarContractViolationReport(pathsToScan) {
  const defaultPaths = Object.keys(RUNTIME_GRAMMAR_HOTSPOT_CONTRACTS);
  const selectedPaths = Array.isArray(pathsToScan) && pathsToScan.length > 0 ?
    pathsToScan :
    defaultPaths;
  return buildGuidelineViolationReport(
    selectedPaths,
    {includeTests: true},
    collectRuntimeGrammarContractViolationsFromSource,
  );
}

function formatRuntimeGrammarContractHumanSummary(report) {
  return formatGuidelineHumanSummary(
    report,
    RUNTIME_GRAMMAR_TEXT.SUMMARY_LABEL,
  );
}

async function main(argv = process.argv.slice(PROCESS_ARG_OFFSET)) {
  return runGuidelineCheck(
    argv,
    buildRuntimeGrammarContractViolationReport,
    formatRuntimeGrammarContractHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  RUNTIME_GRAMMAR_HOTSPOT_CONTRACTS,
  buildRuntimeGrammarContractViolationReport,
  collectRuntimeGrammarContractViolationsFromSource,
};
