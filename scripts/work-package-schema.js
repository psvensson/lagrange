#!/usr/bin/env node

import process from 'node:process';
import fsSync from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const NEWLINE = '\n';
const EMPTY_TEXT = '';
const LIST_PREFIX = '- ';
const STATUS_ACTIVE = 'active';
const STATUS_DONE = 'done';
const STATUS_SUPERSEDED = 'superseded';
const STATUS_TODO = 'todo';
const LANE_READ_REVIEW_DOC_ONLY = 'read-review-doc-only';
const LANE_MECHANICAL_MAINTENANCE = 'mechanical-maintenance';
const LANE_LIGHTWEIGHT_MAINTENANCE = 'lightweight-maintenance';
const LANE_TEST_ONLY_PROOF = 'test-only-proof';
const LANE_DIAGNOSTIC_CLASSIFICATION = 'diagnostic-classification';
const LANE_EXPERIMENT = 'experiment';
const LANE_BOUNDED_EXPERIMENT = 'bounded-experiment';
const LANE_SINGLE_FILE_RUNTIME = 'single-file-runtime';
const LANE_RUNTIME_OWNER_BOUNDARY = 'runtime-owner-boundary';
const LANE_SCENARIO_RELEASE_GATE = 'scenario-release-gate';
const LANE_CAUSAL_ESCALATION = 'causal-escalation';
const LANE_FAST_SPIKE = 'fast-spike';
const LANE_DISCOVERY = 'discovery';
const CANONICAL_LANE_READ_DOC = 'read-doc';
const CANONICAL_LANE_MAINTENANCE = 'maintenance';
const CANONICAL_LANE_PROOF = 'proof';
const CANONICAL_LANE_EXPERIMENT = 'experiment';
const CANONICAL_LANE_RUNTIME = 'runtime';
const CANONICAL_LANE_SCENARIO = 'scenario';
const CANONICAL_LANE_DISCOVERY = 'discovery';
const CORE_LOGIC_BRIEF_CANONICAL_OUTCOME_FIELD = 'Canonical outcome';
const CORE_LOGIC_BRIEF_INPUTS_FIELD = 'Inputs/signals';
const CORE_LOGIC_BRIEF_MODEL_FIELD = 'State model or invariant';
const CORE_LOGIC_BRIEF_NON_GOALS_FIELD =
  'Non-goals and forbidden interpretations';
const CORE_LOGIC_BRIEF_PROOF_FIELD = 'Proof mapping';
const CORE_LOGIC_BRIEF_WRONG_SLICE_FIELD = 'Wrong-slice trigger';
const MODEL_FIT_SPARK_MODEL = 'gpt-5.3-codex-spark';
const MODEL_FIT_54_MODEL = 'gpt-5.4';
const MODEL_FIT_DEFAULT_FRONTIER_MODEL = 'gpt-5.3-codex';
const MODEL_FIT_LEAF_SLICE_SCOPE = 'leaf-slice';
const MODEL_FIT_LIGHTWEIGHT_CLASS = 'bounded-implementation';
const MODEL_FIT_MECHANICAL_CLASS = 'mechanical-maintenance';
const MODEL_FIT_TEST_ONLY_CLASS = 'test-only-proof';
const MODEL_FIT_DIAGNOSTIC_CLASS = 'diagnostic-classification';
const MODEL_FIT_EXPERIMENT_CLASS = 'experiment';
const MODEL_FIT_BOUNDED_EXPERIMENT_CLASS = 'bounded-experiment';
const MODEL_FIT_SINGLE_FILE_RUNTIME_CLASS = 'single-file-runtime';
const MODEL_FIT_RUNTIME_CLASS = 'runtime-owner-boundary';
const MODEL_FIT_SCENARIO_CLASS = 'representative-frontier-closure';
const MODEL_FIT_CAUSAL_CLASS = 'architecture-gap-analysis';
const MODEL_FIT_RUNTIME_SCOPE = 'owner-boundary-contraction';
const MODEL_FIT_SINGLE_FILE_RUNTIME_SCOPE = 'single-runtime-file';
const MODEL_FIT_BOUNDED_EXPERIMENT_SCOPE = MODEL_FIT_LEAF_SLICE_SCOPE;
const MODEL_FIT_DIAGNOSTIC_SCOPE = 'diagnostic-owner-evidence/current-artifact';
const MODEL_FIT_SCENARIO_SCOPE = 'owner-boundary-contraction/current-frontier';
const MODEL_FIT_CAUSAL_SCOPE = 'scenario-causal-escalation';
const OUTPUT_PROFILE_SMALL = 'small';
const OUTPUT_PROFILE_MEDIUM = 'medium';
const OUTPUT_PROFILE_HIGH = 'high';
const OUTPUT_PROFILE_EXTRA_HIGH = 'extra-high';
const WORK_PACKAGE_METADATA_SCHEMA = 'work-package-v2';
const WORK_PACKAGE_METADATA_SCHEMA_V1 = 'work-package-v1';

function normalizeMetadata(metadata, filePath) {
  if (!metadata) return metadata;
  if (metadata.schema === 'work-package-v2') {
    const shim = { ...metadata };

    if (metadata.intent) {
      for (const [k, v] of Object.entries(metadata.intent)) {
        if (shim[k] === undefined) shim[k] = v;
      }
    }
    if (metadata.scope) {
      for (const [k, v] of Object.entries(metadata.scope)) {
        if (shim[k] === undefined) shim[k] = v;
      }
    }
    if (metadata.gates) {
      for (const [k, v] of Object.entries(metadata.gates)) {
        if (shim[k] === undefined) shim[k] = v;
      }
    }
    if (metadata.modelFit) {
      for (const [k, v] of Object.entries(metadata.modelFit)) {
        if (shim[k] === undefined) shim[k] = v;
      }
    }
    if (metadata.execution) {
      for (const [k, v] of Object.entries(metadata.execution)) {
        if (k === 'proof') continue;
        if (shim[k] === undefined) shim[k] = v;
      }
      if (metadata.execution.proof) {
        if (shim.proof === undefined) {
          if (Array.isArray(metadata.execution.proof)) {
            shim.proof = metadata.execution.proof;
          } else {
            shim.proof = metadata.execution.proof.commands || [];
          }
        }
      }
    }

    const companionFile = metadata.gates?.companionGatesFile;
    if (companionFile && filePath) {
      try {
        const companionPath = path.resolve(path.dirname(filePath), companionFile);
        if (fsSync.existsSync(companionPath)) {
          const content = fsSync.readFileSync(companionPath, 'utf8');
          let companionData = {};
          if (companionPath.endsWith('.json')) {
            companionData = JSON.parse(content);
          } else {
            const match = content.match(/<!--\s*(?:work-package-gates|companion-gates)\s*(\{[\s\S]*?\})\s*-->/u) || content.match(/<!--\s*work-package\s*(\{[\s\S]*?\})\s*-->/u);
            if (match) {
              companionData = JSON.parse(match[1]);
            }
          }
          for (const [k, v] of Object.entries(companionData)) {
            if (shim[k] === undefined) {
              shim[k] = v;
            }
          }
        }
      } catch {
        return shim;
      }
    }

    return shim;
  }
  return metadata;
}

const CAUSAL_GOVERNANCE_PENDING_OUTCOME = 'pending-before-rerun';
const SCOPE_FIELD_WRITE_SCOPE = 'writeScope';
const SCOPE_FIELD_HANDOFF_FILES = 'handoffFiles';
const SCOPE_FIELD_GENERATED_FILES = 'generatedFiles';
const SCOPE_FIELD_CANDIDATE_RUNTIME_FILES = 'candidateRuntimeFiles';
const SCOPE_FIELD_COMMIT_SCOPE = 'commitScope';
const THEORY_LEDGER_REFS_FIELD = 'theoryLedgerRefs';
const OWNER_BOUNDARY_MIGRATION_PROOF_FIELD = 'ownerBoundaryMigrationProof';
const OWNER_BOUNDARY_MIGRATION_PROOF_FROM_OWNER_FIELD = 'fromOwner';
const OWNER_BOUNDARY_MIGRATION_PROOF_FROM_BOUNDARY_FIELD = 'fromBoundary';
const OWNER_BOUNDARY_MIGRATION_PROOF_TO_OWNER_FIELD = 'toOwner';
const OWNER_BOUNDARY_MIGRATION_PROOF_TO_BOUNDARY_FIELD = 'toBoundary';
const OWNER_BOUNDARY_MIGRATION_PROOF_REASON_FIELD = 'reason';
const OWNER_BOUNDARY_MIGRATION_PROOF_EVIDENCE_FIELD = 'evidence';
const SCENARIO_CAUSAL_CLOSURE_RECENT_FRONTIER_HISTORY_FIELD =
  'recentFrontierHistory';
const SCENARIO_CAUSAL_CLOSURE_OSCILLATION_CHECK_FIELD =
  'oscillationCheck';
const SCENARIO_CAUSAL_CLOSURE_HANDOFF_INVARIANT_FIELD =
  'handoffInvariant';
const ARCHITECTURE_DECISION_GATE_FIELD = 'architectureDecisionGate';
const RERUN_DECISION_FIELD = 'rerunDecision';
const RERUN_DECISION_SOURCE_ARTIFACT_FIELD = 'sourceArtifact';
const RERUN_DECISION_ROUTE_OWNER_FIELD = 'routeOwner';
const RERUN_DECISION_ROUTE_BOUNDARY_FIELD = 'routeBoundary';
const RERUN_DECISION_ROUTE_DOMINANT_REASON_FIELD = 'routeDominantReason';
const RERUN_DECISION_CAUSAL_OUTCOME_FIELD = 'routeCausalOutcome';
const RERUN_DECISION_STOP_MODE_FIELD = 'stopMode';
const RERUN_DECISION_NEXT_LANE_FIELD = 'nextLane';
const RERUN_DECISION_EXPECTED_DELTA_FIELD = 'expectedDelta';
const RERUN_DECISION_REQUIRED_REFRESH_COMMANDS_FIELD =
  'requiredRefreshCommands';
const RERUN_DECISION_FIELDS = Object.freeze([
  RERUN_DECISION_SOURCE_ARTIFACT_FIELD,
  RERUN_DECISION_ROUTE_OWNER_FIELD,
  RERUN_DECISION_ROUTE_BOUNDARY_FIELD,
  RERUN_DECISION_ROUTE_DOMINANT_REASON_FIELD,
  RERUN_DECISION_CAUSAL_OUTCOME_FIELD,
  RERUN_DECISION_STOP_MODE_FIELD,
  RERUN_DECISION_NEXT_LANE_FIELD,
  RERUN_DECISION_EXPECTED_DELTA_FIELD,
  RERUN_DECISION_REQUIRED_REFRESH_COMMANDS_FIELD,
]);
const CLASSIFICATION_EFFICIENCY_FIELD = 'classificationEfficiency';
const CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD = 'defaultMode';
const CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD =
  'separatePackageReason';
const CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD = 'artifactBudget';
const CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD =
  'proofCommandBudget';
const CLASSIFICATION_EFFICIENCY_COMMANDS_FIELD = 'commands';
const CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD = 'decisionRecord';
const CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD = 'successorAction';
const CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD =
  'runtimePromotionRule';
const CLASSIFICATION_EFFICIENCY_FIELDS = Object.freeze([
  CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD,
  CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD,
  CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_COMMANDS_FIELD,
  CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD,
  CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD,
  CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD,
]);
const CLASSIFICATION_EFFICIENCY_DEFAULT_MODES = Object.freeze([
  'inline-gate-default',
  'separate-package-approved',
]);
const CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASONS = Object.freeze([
  'owner-boundary-or-action-changed',
  'runtime-promotion-blocked',
  'architecture-or-human-stop',
  'tracker-truth-change',
  'successor-selection',
]);
const CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTIONS = Object.freeze([
  'update-current-package',
  'record-in-predecessor-or-sprint',
  'open-runtime-owner-boundary',
  'open-tooling-bug',
  'open-causal-escalation',
  'open-architecture-experiment',
  'present-human-gate',
  'rerun-representative-evidence',
]);
const OBSERVABLE_PREDICTION_FIELD = 'observablePrediction';
const OBSERVABLE_PREDICTION_METRIC_FIELD = 'metric';
const OBSERVABLE_PREDICTION_PREDICTED_FIELD = 'predicted';
const OBSERVABLE_PREDICTION_OBSERVED_FIELD = 'observed';
const OBSERVABLE_PREDICTION_ACCURACY_FIELD = 'accuracy';
const OBSERVABLE_PREDICTION_EVIDENCE_FIELD = 'evidence';
const OBSERVABLE_PREDICTION_METRIC_DELTA_FIELD = 'metricDelta';
const OBSERVABLE_PREDICTION_FIELDS = Object.freeze([
  OBSERVABLE_PREDICTION_METRIC_FIELD,
  OBSERVABLE_PREDICTION_PREDICTED_FIELD,
  OBSERVABLE_PREDICTION_OBSERVED_FIELD,
  OBSERVABLE_PREDICTION_ACCURACY_FIELD,
  OBSERVABLE_PREDICTION_EVIDENCE_FIELD,
  OBSERVABLE_PREDICTION_METRIC_DELTA_FIELD,
]);
const CLOSURE_SUMMARY_FIELD = 'closureSummary';
const CLOSURE_SUMMARY_RESULT_FIELD = 'resultClassification';
const CLOSURE_SUMMARY_PREDICTION_ACCURACY_FIELD = 'predictionAccuracy';
const CLOSURE_SUMMARY_OBSERVED_MOVEMENT_FIELD = 'observedMovement';
const CLOSURE_SUMMARY_SUCCESSOR_REASON_FIELD = 'successorReason';
const CLOSURE_SUMMARY_NEXT_OWNER_BOUNDARY_FIELD = 'nextOwnerBoundary';
const CLOSURE_SUMMARY_EVIDENCE_ARTIFACT_FIELD = 'evidenceArtifact';
const CLOSURE_SUMMARY_FIELDS = Object.freeze([
  CLOSURE_SUMMARY_RESULT_FIELD,
  CLOSURE_SUMMARY_PREDICTION_ACCURACY_FIELD,
  CLOSURE_SUMMARY_OBSERVED_MOVEMENT_FIELD,
  CLOSURE_SUMMARY_SUCCESSOR_REASON_FIELD,
  CLOSURE_SUMMARY_NEXT_OWNER_BOUNDARY_FIELD,
  CLOSURE_SUMMARY_EVIDENCE_ARTIFACT_FIELD,
]);
const EXPERIMENT_OUTCOME_FIELD = 'experimentOutcome';
const EXPERIMENT_OUTCOME_DISTINGUISHED_HYPOTHESIS_FIELD =
  'distinguishedHypothesis';
const EXPERIMENT_OUTCOME_DECISION_FIELD = 'decision';
const EXPERIMENT_OUTCOME_NEXT_OWNER_FIELD = 'nextOwner';
const EXPERIMENT_OUTCOME_NEXT_BOUNDARY_FIELD = 'nextBoundary';
const EXPERIMENT_OUTCOME_EVIDENCE_FIELD = 'evidence';
const EXPERIMENT_OUTCOME_FIELDS = Object.freeze([
  EXPERIMENT_OUTCOME_DISTINGUISHED_HYPOTHESIS_FIELD,
  EXPERIMENT_OUTCOME_DECISION_FIELD,
  EXPERIMENT_OUTCOME_NEXT_OWNER_FIELD,
  EXPERIMENT_OUTCOME_NEXT_BOUNDARY_FIELD,
  EXPERIMENT_OUTCOME_EVIDENCE_FIELD,
]);
const EXPERIMENT_OUTCOME_DECISIONS = Object.freeze([
  'open-runtime-owner-boundary',
  'open-architecture-experiment',
  'open-architecture-contract',
  'owner-boundary-migration',
  'human-escalation',
  'evidence-incomplete',
]);
const REQUIRED_PRE_IMPL_PROBE_FIELD = 'requiredPreImplProbe';
const REQUIRED_PRE_IMPL_PROBE_COMMAND_FIELD = 'command';
const REQUIRED_PRE_IMPL_PROBE_ARTIFACT_FIELD = 'artifact';
const REQUIRED_PRE_IMPL_PROBE_REASON_FIELD = 'reason';
const REQUIRED_PRE_IMPL_PROBE_FIELDS = Object.freeze([
  REQUIRED_PRE_IMPL_PROBE_COMMAND_FIELD,
  REQUIRED_PRE_IMPL_PROBE_ARTIFACT_FIELD,
  REQUIRED_PRE_IMPL_PROBE_REASON_FIELD,
]);
const BOUNDED_EXPERIMENT_FIELD = 'boundedExperiment';
const BOUNDED_EXPERIMENT_HYPOTHESIS_FIELD = 'hypothesis';
const BOUNDED_EXPERIMENT_DISCRIMINATOR_FIELD = 'hypothesisDiscriminator';
const BOUNDED_EXPERIMENT_EXPECTED_METRIC_FIELD = 'expectedMetric';
const BOUNDED_EXPERIMENT_INHERITS_FROM_FIELD = 'inheritsFrom';
const BOUNDED_EXPERIMENT_TIMEBOX_FIELD = 'timebox';
const BOUNDED_EXPERIMENT_MERGE_REQUIREMENT_FIELD = 'mergeRequirement';
const BOUNDED_EXPERIMENT_KILL_RULE_FIELD = 'killRule';
const BOUNDED_EXPERIMENT_FIELDS = Object.freeze([
  BOUNDED_EXPERIMENT_HYPOTHESIS_FIELD,
  BOUNDED_EXPERIMENT_DISCRIMINATOR_FIELD,
  BOUNDED_EXPERIMENT_EXPECTED_METRIC_FIELD,
  BOUNDED_EXPERIMENT_INHERITS_FROM_FIELD,
  BOUNDED_EXPERIMENT_TIMEBOX_FIELD,
  BOUNDED_EXPERIMENT_MERGE_REQUIREMENT_FIELD,
  BOUNDED_EXPERIMENT_KILL_RULE_FIELD,
]);
const PARALLEL_DIAGNOSTICS_FIELD = 'parallelDiagnostics';
const PARALLEL_DIAGNOSTICS_FIELDS = Object.freeze([
  'mode',
  'requiredCards',
  'reportDir',
  'coordinatorOnlyWrites',
  'routeDecisionRequired',
  'trigger',
]);
const PARALLEL_DIAGNOSTICS_MODES = Object.freeze([
  'read-only-scouts',
  'verify-only',
  'none',
]);
const PARALLEL_DIAGNOSTICS_CARD_ROLES = Object.freeze([
  'evidence-scout',
  'model-contract-scout',
  'source-map-scout',
  'verifier',
]);
const INHERITS_CONTEXT_FIELD = 'inheritsContext';
const INHERITS_CONTEXT_FIELDS = Object.freeze([
  'owner',
  'boundary',
  'forbiddenScope',
  'proofCommands',
  'stopRule',
]);
const VALIDATION_TIER_FIELD = 'validationTier';
const VALIDATION_TIER_FILE_LOCAL = 'file-local';
const VALIDATION_TIER_SINGLE_OWNER = 'single-owner';
const VALIDATION_TIER_CROSS_OWNER = 'cross-owner';
const VALIDATION_TIER_RELEASE_GATE = 'release-gate';
const VALIDATION_TIERS = Object.freeze([
  VALIDATION_TIER_FILE_LOCAL,
  VALIDATION_TIER_SINGLE_OWNER,
  VALIDATION_TIER_CROSS_OWNER,
  VALIDATION_TIER_RELEASE_GATE,
]);
const MODEL_FIT_SPLIT_FIELD = 'modelFitSplit';
const MODEL_FIT_SPLIT_TARGET_MODEL_FIELD = 'targetExecutionModel';
const MODEL_FIT_SPLIT_ALLOWED_DECISION_DEPTH_FIELD = 'allowedDecisionDepth';
const MODEL_FIT_SPLIT_SAFE_TO_EXECUTE_WHEN_FIELD = 'safeToExecuteWhen';
const MODEL_FIT_SPLIT_SPLIT_TRIGGERS_FIELD = 'splitTriggers';
const MODEL_FIT_SPLIT_CHILD_CANDIDATES_FIELD = 'childPackageCandidates';
const MODEL_FIT_SPLIT_FIELDS = Object.freeze([
  MODEL_FIT_SPLIT_TARGET_MODEL_FIELD,
  MODEL_FIT_SPLIT_ALLOWED_DECISION_DEPTH_FIELD,
  MODEL_FIT_SPLIT_SAFE_TO_EXECUTE_WHEN_FIELD,
  MODEL_FIT_SPLIT_SPLIT_TRIGGERS_FIELD,
  MODEL_FIT_SPLIT_CHILD_CANDIDATES_FIELD,
]);
const SYSTEM_THEORY_FIELD = 'systemTheory';
const SYSTEM_THEORY_PROBLEM_STATEMENT_FIELD = 'problemStatement';
const SYSTEM_THEORY_PHASE_CHAIN_FIELD = 'phaseChain';
const SYSTEM_THEORY_OWNER_BOUNDARY_MAP_FIELD = 'ownerBoundaryMap';
const SYSTEM_THEORY_STABLE_FACTS_FIELD = 'stableFacts';
const SYSTEM_THEORY_CHANGED_FACTS_FIELD = 'changedFacts';
const SYSTEM_THEORY_COMPETING_THEORIES_FIELD = 'competingTheories';
const SYSTEM_THEORY_ELIMINATED_THEORIES_FIELD = 'eliminatedTheories';
const SYSTEM_THEORY_DOWNSTREAM_SYMPTOMS_FIELD = 'downstreamSymptoms';
const SYSTEM_THEORY_TRANSITION_TABLE_FIELD = 'transitionTable';
const SYSTEM_THEORY_OWNERSHIP_MIGRATION_TRIGGERS_FIELD =
  'ownershipMigrationTriggers';
const SYSTEM_THEORY_ARCHITECTURE_GAP_TRIGGERS_FIELD =
  'architectureGapTriggers';
const SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANT_FIELD = 'wholeSystemInvariant';
const SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANTS_FIELD = 'wholeSystemInvariants';
const SYSTEM_THEORY_INVARIANT_ENTRY_INVARIANT_FIELD = 'invariant';
const SYSTEM_THEORY_INVARIANT_ENTRY_COUPLED_WITH_FIELD = 'coupledWith';
const SYSTEM_THEORY_INVARIANT_ENTRY_COUPLING_NOTE_FIELD = 'couplingNote';
const SYSTEM_THEORY_INVARIANT_ENTRY_FIELDS = Object.freeze([
  SYSTEM_THEORY_INVARIANT_ENTRY_INVARIANT_FIELD,
  SYSTEM_THEORY_INVARIANT_ENTRY_COUPLED_WITH_FIELD,
  SYSTEM_THEORY_INVARIANT_ENTRY_COUPLING_NOTE_FIELD,
]);
const SYSTEM_THEORY_FIELDS = Object.freeze([
  SYSTEM_THEORY_PROBLEM_STATEMENT_FIELD,
  SYSTEM_THEORY_PHASE_CHAIN_FIELD,
  SYSTEM_THEORY_OWNER_BOUNDARY_MAP_FIELD,
  SYSTEM_THEORY_STABLE_FACTS_FIELD,
  SYSTEM_THEORY_CHANGED_FACTS_FIELD,
  SYSTEM_THEORY_COMPETING_THEORIES_FIELD,
  SYSTEM_THEORY_ELIMINATED_THEORIES_FIELD,
  SYSTEM_THEORY_DOWNSTREAM_SYMPTOMS_FIELD,
  SYSTEM_THEORY_TRANSITION_TABLE_FIELD,
  SYSTEM_THEORY_OWNERSHIP_MIGRATION_TRIGGERS_FIELD,
  SYSTEM_THEORY_ARCHITECTURE_GAP_TRIGGERS_FIELD,
  SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANT_FIELD,
  SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANTS_FIELD,
]);
const MODEL_THEORY_FIELD = 'modelTheory';
const MODEL_THEORY_KIND_FIELD = 'modelKind';
const MODEL_THEORY_EXECUTABLE_ARTIFACT_FIELD = 'executableArtifact';
const MODEL_THEORY_PROPERTIES_PROVEN_FIELD = 'propertiesProven';
const MODEL_THEORY_ASSUMPTIONS_FIELD = 'assumptions';
const MODEL_THEORY_COUNTER_EXAMPLE_HANDLING_FIELD = 'counterExampleHandling';
const MODEL_THEORY_LINKED_SYSTEM_THEORY_REF_FIELD = 'linkedSystemTheoryRef';
const MODEL_THEORY_FIELDS = Object.freeze([
  MODEL_THEORY_KIND_FIELD,
  MODEL_THEORY_EXECUTABLE_ARTIFACT_FIELD,
  MODEL_THEORY_PROPERTIES_PROVEN_FIELD,
  MODEL_THEORY_ASSUMPTIONS_FIELD,
  MODEL_THEORY_COUNTER_EXAMPLE_HANDLING_FIELD,
  MODEL_THEORY_LINKED_SYSTEM_THEORY_REF_FIELD,
]);
const MODEL_THEORY_VALID_KINDS = Object.freeze([
  'state-model',
  'simulator',
  'invariant-spec',
  'property-test',
]);
const THEORY_OPTION_LAYER_VOCABULARY = Object.freeze([
  'protocol',
  'scheduling',
  'ownership',
  'observation',
  'topology',
  'model',
]);
const SYSTEM_THEORY_TRANSITION_INPUT_SIGNAL_FIELD = 'inputSignal';
const SYSTEM_THEORY_TRANSITION_OWNER_FIELD = 'owner';
const SYSTEM_THEORY_TRANSITION_MISSING_TRANSITION_FIELD =
  'missingTransition';
const SYSTEM_THEORY_TRANSITION_EXPECTED_EVIDENCE_FIELD = 'expectedEvidence';
const SYSTEM_THEORY_TRANSITION_FALSIFIER_FIELD = 'falsifier';
const SYSTEM_THEORY_TRANSITION_MIGRATION_TRIGGER_FIELD = 'migrationTrigger';
const SYSTEM_THEORY_TRANSITION_FIELDS = Object.freeze([
  SYSTEM_THEORY_TRANSITION_INPUT_SIGNAL_FIELD,
  SYSTEM_THEORY_TRANSITION_OWNER_FIELD,
  SYSTEM_THEORY_TRANSITION_MISSING_TRANSITION_FIELD,
  SYSTEM_THEORY_TRANSITION_EXPECTED_EVIDENCE_FIELD,
  SYSTEM_THEORY_TRANSITION_FALSIFIER_FIELD,
  SYSTEM_THEORY_TRANSITION_MIGRATION_TRIGGER_FIELD,
]);
const SLICE_THEORY_FIELD = 'sliceTheory';
const SLICE_THEORY_SYSTEM_REF_FIELD = 'systemTheoryRef';
const SLICE_THEORY_SELECTED_THEORY_FIELD = 'selectedSystemTheory';
const SLICE_THEORY_SELECTED_MECHANISM_FIELD = 'selectedMechanism';
const SLICE_THEORY_SOURCE_TEST_CONTRACT_FIELD = 'sourceTestContract';
const SLICE_THEORY_FALSIFIER_FIELD = 'falsifier';
const SLICE_THEORY_REPRESENTATIVE_MOVEMENT_FIELD =
  'representativeExpectedMovement';
const SLICE_THEORY_KILL_RULE_FIELD = 'killRule';
const SLICE_THEORY_THEORY_FIT_SCORE_FIELD = 'theoryFitScore';
const SLICE_THEORY_WRONG_SLICE_TRIGGERS_FIELD = 'wrongSliceTriggers';
const SLICE_THEORY_FIELDS = Object.freeze([
  SLICE_THEORY_SYSTEM_REF_FIELD,
  SLICE_THEORY_SELECTED_THEORY_FIELD,
  SLICE_THEORY_SELECTED_MECHANISM_FIELD,
  SLICE_THEORY_SOURCE_TEST_CONTRACT_FIELD,
  SLICE_THEORY_FALSIFIER_FIELD,
  SLICE_THEORY_REPRESENTATIVE_MOVEMENT_FIELD,
  SLICE_THEORY_KILL_RULE_FIELD,
  SLICE_THEORY_THEORY_FIT_SCORE_FIELD,
  SLICE_THEORY_WRONG_SLICE_TRIGGERS_FIELD,
]);
const THEORY_FIT_SCORE_EVIDENCE_FIT_FIELD = 'evidenceFit';
const THEORY_FIT_SCORE_OWNER_BOUNDARY_FIT_FIELD = 'ownerBoundaryFit';
const THEORY_FIT_SCORE_FALSIFIABILITY_FIELD = 'falsifiability';
const THEORY_FIT_SCORE_REPRESENTATIVE_MOVEMENT_FIELD =
  'representativeMovement';
const THEORY_FIT_SCORE_DOWNSTREAM_RISK_FIELD = 'downstreamRiskContainment';
const THEORY_FIT_SCORE_FIELDS = Object.freeze([
  THEORY_FIT_SCORE_EVIDENCE_FIT_FIELD,
  THEORY_FIT_SCORE_OWNER_BOUNDARY_FIT_FIELD,
  THEORY_FIT_SCORE_FALSIFIABILITY_FIELD,
  THEORY_FIT_SCORE_REPRESENTATIVE_MOVEMENT_FIELD,
  THEORY_FIT_SCORE_DOWNSTREAM_RISK_FIELD,
]);
const THEORY_LOOP_FIELD = 'theoryLoop';
const THEORY_LOOP_ENFORCEMENT_FIELD = 'enforcement';
const THEORY_LOOP_PROMOTED_THEORY_FIELD = 'promotedTheory';
const THEORY_LOOP_SPRINT_GOAL_DELTA_FIELD = 'sprintGoalDelta';
const THEORY_LOOP_RESULT_FIELD = 'result';
const THEORY_LOOP_SUCCESSOR_PACKAGE_FIELD = 'successorPackage';
const THEORY_LOOP_SOURCE_CHANGE_REQUIRED_FIELD = 'sourceChangeRequired';
const THEORY_LOOP_SUCCESSOR_REQUIRED_FIELD = 'successorRequired';
const THEORY_LOOP_OUTCOME_EVIDENCE_FIELD = 'outcomeEvidence';
const THEORY_LOOP_SPRINT_CLOSURE_REF_FIELD = 'sprintClosureRef';
const THEORY_LOOP_OUTCOME_FIELD = 'outcome';
const THEORY_LOOP_OUTCOME_VALUES = Object.freeze([
  'theory-confirmed',
  'theory-falsified',
  'inconclusive',
  'migrated',
]);
const THEORY_LOOP_JOINT_FALSIFIER_COMMAND_FIELD = 'jointFalsifierCommand';
const THEORY_LOOP_ARCHITECTURE_ROUTE_FIELD = 'architectureRoute';
const THEORY_LOOP_ALTERNATING_PAIR_BOUNDARIES_FIELD =
  'alternatingPairBoundaries';
const THEORY_LOOP_GATE_MARKER_FIELD = 'gateMarker';
const THEORY_LOOP_GATE_MARKER_VALUES = Object.freeze([
  'same-mechanism-repeat',
  'compositional-pair-alternation',
  'pair-alternation-post-rederive',
  'emergent-class-present',
]);
const THEORY_LOOP_ENFORCEMENT_SOURCE_PACKAGE =
  'source-code-package-required';
const THEORY_LOOP_FIELDS = Object.freeze([
  THEORY_LOOP_ENFORCEMENT_FIELD,
  THEORY_LOOP_PROMOTED_THEORY_FIELD,
  THEORY_LOOP_SPRINT_GOAL_DELTA_FIELD,
  THEORY_LOOP_RESULT_FIELD,
  THEORY_LOOP_SUCCESSOR_PACKAGE_FIELD,
  THEORY_LOOP_SOURCE_CHANGE_REQUIRED_FIELD,
  THEORY_LOOP_SUCCESSOR_REQUIRED_FIELD,
  THEORY_LOOP_OUTCOME_EVIDENCE_FIELD,
  THEORY_LOOP_SPRINT_CLOSURE_REF_FIELD,
  THEORY_LOOP_OUTCOME_FIELD,
  THEORY_LOOP_JOINT_FALSIFIER_COMMAND_FIELD,
  THEORY_LOOP_ARCHITECTURE_ROUTE_FIELD,
  THEORY_LOOP_ALTERNATING_PAIR_BOUNDARIES_FIELD,
  THEORY_LOOP_GATE_MARKER_FIELD,
]);
const LOWER_MODEL_WORKFLOW_LANES = Object.freeze([
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_MECHANICAL_MAINTENANCE,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_TEST_ONLY_PROOF,
  LANE_EXPERIMENT,
  LANE_BOUNDED_EXPERIMENT,
  LANE_SINGLE_FILE_RUNTIME,
  LANE_FAST_SPIKE,
]);
const SPARK_SAFE_WORKFLOW_LANES = Object.freeze([
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_MECHANICAL_MAINTENANCE,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_TEST_ONLY_PROOF,
  LANE_EXPERIMENT,
  LANE_BOUNDED_EXPERIMENT,
  LANE_FAST_SPIKE,
]);
const ARCHITECTURE_DECISION_GATE_STATUSES = Object.freeze([
  'not-required',
  'required',
  'presented',
  'selected',
  'watching',
]);
const ARCHITECTURE_DECISION_GATE_TRIGGERS = Object.freeze([
  'none',
  'architecture-gap',
  'frontier-oscillation',
]);
const ARCHITECTURE_DECISION_GATE_ROUTES = Object.freeze([
  'continue-local-proof',
  'owner-boundary-migration',
  'architecture-package',
  'human-escalation',
]);
const VALIDATION_PHASE_ENTRY = 'entry';
const VALIDATION_PHASE_PROBE = 'probe';
const VALIDATION_PHASE_PRE_IMPL = 'pre-impl';
const VALIDATION_PHASE_CLOSURE = 'closure';
const SUBAGENT_UNAVAILABLE_HUMAN_WAIVED = 'human-waived';
const SUBAGENT_UNAVAILABLE_TOOL_UNAVAILABLE = 'tool-unavailable';
const SUBAGENT_UNAVAILABLE_BLOCKED_BY_ENVIRONMENT_POLICY =
  'blocked-by-environment-policy';
const SUBAGENT_ATTEMPT_STARTED = 'started';
const SUBAGENT_ATTEMPT_RUNNING = 'running';
const SUBAGENT_ATTEMPT_INTERRUPTED = 'interrupted';
const SUBAGENT_ATTEMPT_PARTIAL_UNVALIDATED = 'partial-unvalidated';
const SUBAGENT_ATTEMPT_VALIDATED = 'validated';
const SUBAGENT_ATTEMPT_SUPERSEDED = 'superseded';

const METADATA_FIELD_STABILITY_CREDIT = 'stabilityCredit';
const METADATA_FIELD_WHY_HIGHEST_LEVERAGE_NOW = 'whyHighestLeverageNow';
const METADATA_FIELD_REPRESENTATIVE_RERUN_CADENCE = 'representativeRerunCadence';
const METADATA_FIELD_CODE_QUALITY_ADMISSION = 'codeQualityAdmission';
const CODE_QUALITY_ADMISSION_REASONS = Object.freeze([
  'removes-duplicate-decision-paths',
  'preserves-owner-outcomes',
  'improves-evidence-fidelity',
  'prevents-regression',
  'active-guardrail-requirement',
]);
const STABILITY_CREDIT_VALID_VALUES = Object.freeze([
  'representative-green',
  'representative-migrated',
  'representative-reduced',
  'local-proof-only',
  'instrumentation-only',
]);
const REPRESENTATIVE_RERUN_CADENCE_VALID_VALUES = Object.freeze([
  'fresh-representative-rerun',
  'scheduled-rerun-command',
  'explicit-invalid-rerun-reason',
  'architecture-stop-reason',
]);

const VALID_PACKAGE_STATUSES = Object.freeze([
  STATUS_ACTIVE,
  STATUS_DONE,
  STATUS_SUPERSEDED,
  STATUS_TODO,
]);

const CANONICAL_WORKFLOW_LANES = Object.freeze([
  CANONICAL_LANE_READ_DOC,
  CANONICAL_LANE_MAINTENANCE,
  CANONICAL_LANE_PROOF,
  CANONICAL_LANE_EXPERIMENT,
  CANONICAL_LANE_RUNTIME,
  CANONICAL_LANE_SCENARIO,
  CANONICAL_LANE_DISCOVERY,
]);

const LEGACY_WORKFLOW_LANE_ALIASES = Object.freeze({
  [LANE_READ_REVIEW_DOC_ONLY]: CANONICAL_LANE_READ_DOC,
  [LANE_MECHANICAL_MAINTENANCE]: CANONICAL_LANE_MAINTENANCE,
  [LANE_LIGHTWEIGHT_MAINTENANCE]: CANONICAL_LANE_MAINTENANCE,
  [LANE_TEST_ONLY_PROOF]: CANONICAL_LANE_PROOF,
  [LANE_DIAGNOSTIC_CLASSIFICATION]: CANONICAL_LANE_PROOF,
  [LANE_EXPERIMENT]: CANONICAL_LANE_EXPERIMENT,
  [LANE_BOUNDED_EXPERIMENT]: CANONICAL_LANE_EXPERIMENT,
  [LANE_FAST_SPIKE]: CANONICAL_LANE_EXPERIMENT,
  [LANE_SINGLE_FILE_RUNTIME]: CANONICAL_LANE_RUNTIME,
  [LANE_RUNTIME_OWNER_BOUNDARY]: CANONICAL_LANE_RUNTIME,
  [LANE_SCENARIO_RELEASE_GATE]: CANONICAL_LANE_SCENARIO,
  [LANE_CAUSAL_ESCALATION]: CANONICAL_LANE_SCENARIO,
  [LANE_DISCOVERY]: CANONICAL_LANE_DISCOVERY,
});

const WORKFLOW_LANES = Object.freeze([
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_MECHANICAL_MAINTENANCE,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_TEST_ONLY_PROOF,
  LANE_DIAGNOSTIC_CLASSIFICATION,
  LANE_EXPERIMENT,
  LANE_BOUNDED_EXPERIMENT,
  LANE_SINGLE_FILE_RUNTIME,
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SCENARIO_RELEASE_GATE,
  LANE_CAUSAL_ESCALATION,
  LANE_FAST_SPIKE,
  LANE_DISCOVERY,
]);

const SUBAGENT_OPTIONAL_LANES = Object.freeze([
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_MECHANICAL_MAINTENANCE,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_TEST_ONLY_PROOF,
  LANE_DIAGNOSTIC_CLASSIFICATION,
  LANE_EXPERIMENT,
  LANE_BOUNDED_EXPERIMENT,
  LANE_SINGLE_FILE_RUNTIME,
  LANE_FAST_SPIKE,
  LANE_DISCOVERY,
]);

const CORE_LOGIC_BRIEF_REQUIRED_LANES = Object.freeze([
  LANE_SINGLE_FILE_RUNTIME,
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SCENARIO_RELEASE_GATE,
  LANE_CAUSAL_ESCALATION,
]);

const CORE_LOGIC_BRIEF_FIELDS = Object.freeze([
  CORE_LOGIC_BRIEF_CANONICAL_OUTCOME_FIELD,
  CORE_LOGIC_BRIEF_INPUTS_FIELD,
  CORE_LOGIC_BRIEF_MODEL_FIELD,
  CORE_LOGIC_BRIEF_NON_GOALS_FIELD,
  CORE_LOGIC_BRIEF_PROOF_FIELD,
  CORE_LOGIC_BRIEF_WRONG_SLICE_FIELD,
]);

const CAUSAL_GOVERNANCE_VALID_OUTCOMES = Object.freeze([
  'representative-green',
  'reduced',
  'same-frontier',
  'migrated',
  'classification-only',
  'architecture-gap',
  'contradictory',
  CAUSAL_GOVERNANCE_PENDING_OUTCOME,
]);

const SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS = Object.freeze([
  'pending-before-probe',
  'representative-green',
  'reduced',
  'same-frontier',
  'migrated',
  'classification-only',
  'architecture-gap',
  'contradictory',
]);

const SCENARIO_CAUSAL_CLOSURE_VALID_STOP_CONDITIONS = Object.freeze([
  'continue-local-fix',
  'bounded-non-frontier',
  'migrate-owner-boundary',
  'classification-only-stop',
  'architecture-gap-stop',
  'representative-green',
  'human-escalation',
]);

const SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISMS = Object.freeze([
  'wake',
  'retry',
  'timeout',
  'reconcile',
  'drain',
  'dispatch',
  'delivery',
  'timer',
  'advance',
  'bounded',
]);

const WORK_PACKAGE_SCOPE_FIELDS = Object.freeze([
  SCOPE_FIELD_WRITE_SCOPE,
  SCOPE_FIELD_HANDOFF_FILES,
  SCOPE_FIELD_GENERATED_FILES,
  SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
  SCOPE_FIELD_COMMIT_SCOPE,
]);
const REPRESENTATIVE_RESIDUAL_FIELD = 'representativeResidual';
const REPRESENTATIVE_RESIDUAL_FIELDS = Object.freeze([
  'status',
  'scenario',
  'artifact',
  'frontier',
  'residualCount',
  'owner',
  'boundary',
  'dominantReason',
  'nextAction',
]);

const OWNER_BOUNDARY_MIGRATION_PROOF_FIELDS = Object.freeze([
  OWNER_BOUNDARY_MIGRATION_PROOF_FROM_OWNER_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FROM_BOUNDARY_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_TO_OWNER_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_TO_BOUNDARY_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_REASON_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_EVIDENCE_FIELD,
]);

const SCENARIO_CAUSAL_CLOSURE_FRONTIER_OSCILLATION_FIELDS = Object.freeze([
  SCENARIO_CAUSAL_CLOSURE_RECENT_FRONTIER_HISTORY_FIELD,
  SCENARIO_CAUSAL_CLOSURE_OSCILLATION_CHECK_FIELD,
  SCENARIO_CAUSAL_CLOSURE_HANDOFF_INVARIANT_FIELD,
]);

const MECHANISM_CARD_FIELD = 'mechanismCard';
const MECHANISM_CARD_FIELDS = Object.freeze([
  'failureMechanism',
  'stableFacts',
  'changedFacts',
  'rejectedAlternatives',
  'ownerWhoDecides',
  'currentAction',
  'missingTransitionOrObservation',
  'smallestFalsifyingProbe',
  'expectedMovement',
  'negativeResultMeans',
  'escalationRule',
]);

const VALIDATION_PHASES = Object.freeze([
  VALIDATION_PHASE_ENTRY,
  VALIDATION_PHASE_PROBE,
  VALIDATION_PHASE_PRE_IMPL,
  VALIDATION_PHASE_CLOSURE,
]);

const VALID_OUTPUT_PROFILES = Object.freeze([
  OUTPUT_PROFILE_SMALL,
  OUTPUT_PROFILE_MEDIUM,
  OUTPUT_PROFILE_HIGH,
  OUTPUT_PROFILE_EXTRA_HIGH,
]);

const SUBAGENT_UNAVAILABLE_STATES = Object.freeze([
  SUBAGENT_UNAVAILABLE_HUMAN_WAIVED,
  SUBAGENT_UNAVAILABLE_TOOL_UNAVAILABLE,
  SUBAGENT_UNAVAILABLE_BLOCKED_BY_ENVIRONMENT_POLICY,
]);

const SUBAGENT_ATTEMPT_STATUSES = Object.freeze([
  SUBAGENT_ATTEMPT_STARTED,
  SUBAGENT_ATTEMPT_RUNNING,
  SUBAGENT_ATTEMPT_INTERRUPTED,
  SUBAGENT_ATTEMPT_PARTIAL_UNVALIDATED,
  SUBAGENT_ATTEMPT_VALIDATED,
  SUBAGENT_ATTEMPT_SUPERSEDED,
]);

const DEFAULT_MODEL_FIT_BY_LANE = Object.freeze({
  [LANE_READ_REVIEW_DOC_ONLY]: Object.freeze({
    packageClass: MODEL_FIT_LIGHTWEIGHT_CLASS,
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_LEAF_SLICE_SCOPE,
    outputProfile: OUTPUT_PROFILE_SMALL,
  }),
  [LANE_MECHANICAL_MAINTENANCE]: Object.freeze({
    packageClass: MODEL_FIT_MECHANICAL_CLASS,
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_LEAF_SLICE_SCOPE,
    outputProfile: OUTPUT_PROFILE_SMALL,
  }),
  [LANE_LIGHTWEIGHT_MAINTENANCE]: Object.freeze({
    packageClass: MODEL_FIT_LIGHTWEIGHT_CLASS,
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_LEAF_SLICE_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_TEST_ONLY_PROOF]: Object.freeze({
    packageClass: MODEL_FIT_TEST_ONLY_CLASS,
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_LEAF_SLICE_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_DIAGNOSTIC_CLASSIFICATION]: Object.freeze({
    packageClass: MODEL_FIT_DIAGNOSTIC_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_DIAGNOSTIC_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_EXPERIMENT]: Object.freeze({
    packageClass: MODEL_FIT_EXPERIMENT_CLASS,
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_BOUNDED_EXPERIMENT_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_BOUNDED_EXPERIMENT]: Object.freeze({
    packageClass: MODEL_FIT_BOUNDED_EXPERIMENT_CLASS,
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_BOUNDED_EXPERIMENT_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_SINGLE_FILE_RUNTIME]: Object.freeze({
    packageClass: MODEL_FIT_SINGLE_FILE_RUNTIME_CLASS,
    intendedMinimumModel: MODEL_FIT_54_MODEL,
    scopeShape: MODEL_FIT_SINGLE_FILE_RUNTIME_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_RUNTIME_OWNER_BOUNDARY]: Object.freeze({
    packageClass: MODEL_FIT_RUNTIME_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_RUNTIME_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_SCENARIO_RELEASE_GATE]: Object.freeze({
    packageClass: MODEL_FIT_SCENARIO_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_SCENARIO_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_CAUSAL_ESCALATION]: Object.freeze({
    packageClass: MODEL_FIT_CAUSAL_CLASS,
    intendedMinimumModel: MODEL_FIT_DEFAULT_FRONTIER_MODEL,
    scopeShape: MODEL_FIT_CAUSAL_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
  [LANE_FAST_SPIKE]: Object.freeze({
    packageClass: 'fast-spike',
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_LEAF_SLICE_SCOPE,
    outputProfile: OUTPUT_PROFILE_SMALL,
  }),
  [LANE_DISCOVERY]: Object.freeze({
    packageClass: 'discovery-framing',
    intendedMinimumModel: MODEL_FIT_SPARK_MODEL,
    scopeShape: MODEL_FIT_LEAF_SLICE_SCOPE,
    outputProfile: OUTPUT_PROFILE_MEDIUM,
  }),
});

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function firstCountKey(counts = []) {
  const [first] = counts;
  return Array.isArray(first) ? normalizeText(first[0]) : EMPTY_TEXT;
}

function isEscalationRecommended(modelLedgerSummary = {}) {
  return normalizeText(modelLedgerSummary.recommendation) === 'escalate';
}

function defaultModelFitForLane(lane, modelLedgerSummary = {}) {
  const normalizedLane = normalizeText(lane) || LANE_LIGHTWEIGHT_MAINTENANCE;
  const defaults =
    DEFAULT_MODEL_FIT_BY_LANE[normalizedLane] ||
    DEFAULT_MODEL_FIT_BY_LANE[LANE_LIGHTWEIGHT_MAINTENANCE];
  const dominantPackageClass =
    firstCountKey(modelLedgerSummary.packageClasses) || defaults.packageClass;
  const dominantScopeShape =
    firstCountKey(modelLedgerSummary.scopeShapes) || defaults.scopeShape;
  const shouldEscalate = isEscalationRecommended(modelLedgerSummary) &&
    !SUBAGENT_OPTIONAL_LANES.includes(normalizedLane);

  return {
    packageClass: shouldEscalate ? dominantPackageClass : defaults.packageClass,
    intendedMinimumModel: shouldEscalate ?
      MODEL_FIT_DEFAULT_FRONTIER_MODEL :
      defaults.intendedMinimumModel,
    scopeShape: shouldEscalate ? dominantScopeShape : defaults.scopeShape,
    outputProfile: defaults.outputProfile,
    ledgerRecommendation:
      normalizeText(modelLedgerSummary.recommendation) || 'hold',
  };
}

function defaultOutputProfileForLane(lane) {
  const normalizedLane = normalizeText(lane) || LANE_LIGHTWEIGHT_MAINTENANCE;
  return (
    DEFAULT_MODEL_FIT_BY_LANE[normalizedLane] ||
    DEFAULT_MODEL_FIT_BY_LANE[LANE_LIGHTWEIGHT_MAINTENANCE]
  ).outputProfile;
}

function renderEnumList(values = []) {
  return values.map((value) => `${LIST_PREFIX}\`${value}\``).join(NEWLINE);
}

function coreLogicBriefRequiredForLane(lane) {
  return CORE_LOGIC_BRIEF_REQUIRED_LANES.includes(normalizeText(lane));
}

function renderSchemaReference() {
  return [
    '# Work Package Schema Reference',
    EMPTY_TEXT,
    `- Metadata schema: \`${WORK_PACKAGE_METADATA_SCHEMA}\``,
    EMPTY_TEXT,
    '## Package Statuses',
    EMPTY_TEXT,
    renderEnumList(VALID_PACKAGE_STATUSES),
    EMPTY_TEXT,
    '## Workflow Lanes',
    EMPTY_TEXT,
    'Canonical lanes:',
    EMPTY_TEXT,
    renderEnumList(CANONICAL_WORKFLOW_LANES),
    EMPTY_TEXT,
    'Legacy package lane aliases accepted for this closure cycle:',
    EMPTY_TEXT,
    renderEnumList(WORKFLOW_LANES),
    EMPTY_TEXT,
    '## Stability Credits',
    EMPTY_TEXT,
    renderEnumList(STABILITY_CREDIT_VALID_VALUES),
    EMPTY_TEXT,
    '## Leverage Focus Gate',
    EMPTY_TEXT,
    `- Metadata field: \`${METADATA_FIELD_WHY_HIGHEST_LEVERAGE_NOW}\``,
    '- Purpose: justify why this package is the highest-leverage next action for the current sprint goal or representative stability gate.',
    EMPTY_TEXT,
    '## Code Quality Admission Gate',
    EMPTY_TEXT,
    `- Metadata field: \`${METADATA_FIELD_CODE_QUALITY_ADMISSION}\``,
    '- Purpose: require cleanup or maintenance packages in active scenario/stability sprints to state their stability-relevant effect before activation.',
    '- Allowed reasons:',
    EMPTY_TEXT,
    renderEnumList(CODE_QUALITY_ADMISSION_REASONS),
    EMPTY_TEXT,
    '## Representative Rerun Cadence Gates',
    EMPTY_TEXT,
    `- Metadata field: \`${METADATA_FIELD_REPRESENTATIVE_RERUN_CADENCE}\``,
    '- Purpose: enforce a cadence of representative reruns on focused runtime/scenario packages.',
    '- Allowed values:',
    EMPTY_TEXT,
    renderEnumList(REPRESENTATIVE_RERUN_CADENCE_VALID_VALUES),
    EMPTY_TEXT,
    '## Model-Fit Package Splitter',
    EMPTY_TEXT,
    '- Purpose: split broad work into lower-model execution packages before implementation whenever ownership, scope, and proof can be made mechanical.',
    '- Package authoring should decide owner, boundary, hypothesis, proof, do-not-edit scope, and kill rule before assigning execution to a lower model.',
    EMPTY_TEXT,
    'Lower-model execution lanes:',
    EMPTY_TEXT,
    renderEnumList(LOWER_MODEL_WORKFLOW_LANES),
    EMPTY_TEXT,
    'Spark-safe lanes:',
    EMPTY_TEXT,
    renderEnumList(SPARK_SAFE_WORKFLOW_LANES),
    EMPTY_TEXT,
    'Package class defaults:',
    EMPTY_TEXT,
    `- \`${LANE_MECHANICAL_MAINTENANCE}\` -> \`${MODEL_FIT_SPARK_MODEL}\` for docs/templates/schema/mechanical metadata edits.`,
    `- \`${LANE_TEST_ONLY_PROOF}\` -> \`${MODEL_FIT_SPARK_MODEL}\` for test-only evidence without runtime behavior changes.`,
    `- \`${LANE_EXPERIMENT}\` -> \`${MODEL_FIT_SPARK_MODEL}\` for probe packages whose success criterion is information, not metric movement.`,
    `- \`${LANE_BOUNDED_EXPERIMENT}\` -> \`${MODEL_FIT_SPARK_MODEL}\` for one inherited-owner hypothesis with proof-gated merge.`,
    `- \`${LANE_SINGLE_FILE_RUNTIME}\` -> \`${MODEL_FIT_54_MODEL}\` for one preselected runtime file with core logic and focused proof.`,
    `- Cross-owner runtime, scenario release gates, and architecture route decisions stay on \`${MODEL_FIT_DEFAULT_FRONTIER_MODEL}\` or stronger.`,
    '- Subagent prompts should set `targetExecutionModel` explicitly; inherited stronger parent models are escalation, not the default.',
    EMPTY_TEXT,
    `- Metadata field: \`${MODEL_FIT_SPLIT_FIELD}\``,
    renderEnumList(MODEL_FIT_SPLIT_FIELDS),
    EMPTY_TEXT,
    '## Output Profiles',
    EMPTY_TEXT,
    renderEnumList(VALID_OUTPUT_PROFILES),
    EMPTY_TEXT,
    '## Scope Fields',
    EMPTY_TEXT,
    renderEnumList(WORK_PACKAGE_SCOPE_FIELDS),
    EMPTY_TEXT,
    '## Theory Ledger References',
    EMPTY_TEXT,
    `- Metadata field: \`${THEORY_LEDGER_REFS_FIELD}\``,
    '- Optional array of `theory-YYYYMMDD-short-slug` ids related to the package.',
    '- Advisory only: theory ledger refs help agents find context; packages, current-blocker, and artifacts remain source of truth.',
    EMPTY_TEXT,
    '## Core Logic Brief',
    EMPTY_TEXT,
    'Required lanes:',
    EMPTY_TEXT,
    renderEnumList(CORE_LOGIC_BRIEF_REQUIRED_LANES),
    EMPTY_TEXT,
    'Fields:',
    EMPTY_TEXT,
    renderEnumList(CORE_LOGIC_BRIEF_FIELDS),
    EMPTY_TEXT,
    '## Causal Decision Contract',
    EMPTY_TEXT,
    '- Required before implementation for active runtime-owner-boundary, scenario-release-gate, and causal-escalation packages.',
    '- Decision table columns: `Signal`, `Normalized value`, `Owner interpretation`, `Emitted outcome`, `Expected delta`, `Disproof probe`.',
    '- Required fields: `Anti-symptom rationale`, `Falsifying focused probe`, `Competing explanations`, `Systemic interaction scan`, and `Ping-pong stop rule`.',
    '- Frontier oscillation packages must also explain the `Oscillation guard` before another local patch.',
    EMPTY_TEXT,
    '## Decision Experiment Gate',
    EMPTY_TEXT,
    '- Required before implementation for active runtime-owner-boundary, scenario-release-gate, and causal-escalation packages.',
    '- Treat the next implementation package as a falsifiable decision experiment, not a prose handoff.',
    '- Required fields: `Decision question`, `Architecture review`, `Competing hypotheses`, `Pre-edit focused probe`, `Success metrics`, `Representative rerun`, and `Redirect rule` (legacy name `Kill rule`, still accepted).',
    '- Success metrics must name a concrete metric/count/frontier movement, owner-boundary migration, or representative green condition.',
    '- The redirect rule must open/select an autonomous architecture experiment on unchanged same-frontier/no-reduction evidence instead of opening another local patch. Human escalation is only for contradictory or blocked evidence.',
    EMPTY_TEXT,
    '## Two-Level Theory',
    EMPTY_TEXT,
    `- System-level metadata field: \`${SYSTEM_THEORY_FIELD}\``,
    '- Required for active causal-escalation, architecture-gated, owner-migration, and repeated-frontier packages before implementation.',
    '- System theory captures the whole-system causal map: phase chain, owner-boundary graph, stable and changed facts, competing and eliminated theories, downstream symptoms, transition table, migration triggers, architecture-gap triggers, and invariant.',
    renderEnumList(SYSTEM_THEORY_FIELDS),
    EMPTY_TEXT,
    'Transition table fields:',
    EMPTY_TEXT,
    renderEnumList(SYSTEM_THEORY_TRANSITION_FIELDS),
    EMPTY_TEXT,
    `- Slice-level metadata field: \`${SLICE_THEORY_FIELD}\``,
    '- Slice theory cites the system theory and names the one executable contract, falsifier, representative movement, kill rule, wrong-slice triggers, and theory-fit score for the current package.',
    renderEnumList(SLICE_THEORY_FIELDS),
    EMPTY_TEXT,
    'Theory-fit score fields:',
    EMPTY_TEXT,
    renderEnumList(THEORY_FIT_SCORE_FIELDS),
    EMPTY_TEXT,
    '## Theory Loop Source Package',
    EMPTY_TEXT,
    `- Metadata field: \`${THEORY_LOOP_FIELD}\``,
    '- Purpose: marks theory-loop packages that must carry one promoted theory through source-code change, falsifying proof, result recording, and successor creation.',
    '- Enforcement value: `source-code-package-required`.',
    '- Classification-only packages are forbidden in theory-loop sprints; evidence-only discrimination remains in the sprint until it promotes real `src/` work.',
    EMPTY_TEXT,
    'Fields:',
    EMPTY_TEXT,
    renderEnumList(THEORY_LOOP_FIELDS),
    EMPTY_TEXT,
    '## Representative Residual',
    EMPTY_TEXT,
    `- Metadata field: \`${REPRESENTATIVE_RESIDUAL_FIELD}\``,
    renderEnumList(REPRESENTATIVE_RESIDUAL_FIELDS),
    EMPTY_TEXT,
    '## Owner Boundary Migration Proof',
    EMPTY_TEXT,
    `- Metadata field: \`${OWNER_BOUNDARY_MIGRATION_PROOF_FIELD}\``,
    renderEnumList(OWNER_BOUNDARY_MIGRATION_PROOF_FIELDS),
    EMPTY_TEXT,
    '## Rerun Decision',
    EMPTY_TEXT,
    `- Metadata field: \`${RERUN_DECISION_FIELD}\``,
    renderEnumList(RERUN_DECISION_FIELDS),
    EMPTY_TEXT,
    '## Classification Efficiency',
    EMPTY_TEXT,
    `- Metadata field: \`${CLASSIFICATION_EFFICIENCY_FIELD}\``,
    renderEnumList(CLASSIFICATION_EFFICIENCY_FIELDS),
    EMPTY_TEXT,
    'Default modes:',
    EMPTY_TEXT,
    renderEnumList(CLASSIFICATION_EFFICIENCY_DEFAULT_MODES),
    EMPTY_TEXT,
    'Separate package reasons:',
    EMPTY_TEXT,
    renderEnumList(CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASONS),
    EMPTY_TEXT,
    'Successor actions:',
    EMPTY_TEXT,
    renderEnumList(CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTIONS),
    EMPTY_TEXT,
    '## Observable Prediction',
    EMPTY_TEXT,
    `- Metadata field: \`${OBSERVABLE_PREDICTION_FIELD}\``,
    '- Purpose: pre-register a falsifiable numeric/state prediction before the probe or representative run, then record observed result and accuracy at closure.',
    '- Optional numeric movement: `metricDelta` records representative metric points moved when the package can measure them; package-cost reporting falls back to movement classification when it is absent.',
    EMPTY_TEXT,
    'Fields:',
    EMPTY_TEXT,
    renderEnumList(OBSERVABLE_PREDICTION_FIELDS),
    EMPTY_TEXT,
    '## Closure Summary',
    EMPTY_TEXT,
    `- Metadata field: \`${CLOSURE_SUMMARY_FIELD}\``,
    '- Purpose: put the closed-package outcome, prediction result, movement, successor reason, next owner/boundary, and evidence artifact in the first metadata block so summary tooling does not infer it from long prose.',
    '- Required by package close/migrate for new done packages after adoption; historical packages may omit it, but tools prefer it when present.',
    '- Template pending values are allowed before closure, but closure validation requires concrete values and rejects pending placeholders.',
    EMPTY_TEXT,
    'Fields:',
    EMPTY_TEXT,
    renderEnumList(CLOSURE_SUMMARY_FIELDS),
    EMPTY_TEXT,
    '## Experiment Outcome',
    EMPTY_TEXT,
    `- Metadata field: \`${EXPERIMENT_OUTCOME_FIELD}\``,
    '- Purpose: close an experiment by recording the hypothesis that was distinguished, or an explicit evidence-incomplete decision.',
    EMPTY_TEXT,
    'Fields:',
    EMPTY_TEXT,
    renderEnumList(EXPERIMENT_OUTCOME_FIELDS),
    EMPTY_TEXT,
    'Decision values:',
    EMPTY_TEXT,
    renderEnumList(EXPERIMENT_OUTCOME_DECISIONS),
    EMPTY_TEXT,
    '## Required Pre-Implementation Probe',
    EMPTY_TEXT,
    `- Metadata field: \`${REQUIRED_PRE_IMPL_PROBE_FIELD}\``,
    '- Purpose: require runtime source packages to cite a fixture or focused probe before pre-implementation validation passes.',
    '- Scenario packages may also use `scenarioCausalClosure.boundedProgressProofArtifact` with `missingCausalEdgeProbe` for the same requirement.',
    EMPTY_TEXT,
    'Fields:',
    EMPTY_TEXT,
    renderEnumList(REQUIRED_PRE_IMPL_PROBE_FIELDS),
    EMPTY_TEXT,
    '## Bounded Experiment Lane',
    EMPTY_TEXT,
    `- Workflow lane: \`${LANE_BOUNDED_EXPERIMENT}\``,
    `- First-class probe lane: \`${LANE_EXPERIMENT}\``,
    `- Metadata field: \`${BOUNDED_EXPERIMENT_FIELD}\``,
    '- Purpose: same-owner or tightly bounded hypothesis-driven implementation slices that inherit context and merge only after proof.',
    '- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.',
    EMPTY_TEXT,
    'Fields:',
    EMPTY_TEXT,
    renderEnumList(BOUNDED_EXPERIMENT_FIELDS),
    EMPTY_TEXT,
    `- Context inheritance field: \`${INHERITS_CONTEXT_FIELD}\``,
    renderEnumList(INHERITS_CONTEXT_FIELDS),
    EMPTY_TEXT,
    `- Validation tier field: \`${VALIDATION_TIER_FIELD}\``,
    renderEnumList(VALIDATION_TIERS),
    EMPTY_TEXT,
    '## Parallel Diagnostics',
    EMPTY_TEXT,
    `- Metadata field: \`${PARALLEL_DIAGNOSTICS_FIELD}\``,
    '- Purpose: let the coordinator request parallel read-only scout or verifier route cards without handing workflow-state authority to subagents.',
    '- Scout cards are advisory evidence, not package truth. The coordinator alone updates active package status, current-blocker, sprint status, and theory-ledger decisions.',
    EMPTY_TEXT,
    'Fields:',
    EMPTY_TEXT,
    renderEnumList(PARALLEL_DIAGNOSTICS_FIELDS),
    EMPTY_TEXT,
    'Modes:',
    EMPTY_TEXT,
    renderEnumList(PARALLEL_DIAGNOSTICS_MODES),
    EMPTY_TEXT,
    'Card roles:',
    EMPTY_TEXT,
    renderEnumList(PARALLEL_DIAGNOSTICS_CARD_ROLES),
    EMPTY_TEXT,
    '## Validation Phases',
    EMPTY_TEXT,
    renderEnumList(VALIDATION_PHASES),
    EMPTY_TEXT,
    '## Subagent Unavailable States',
    EMPTY_TEXT,
    renderEnumList(SUBAGENT_UNAVAILABLE_STATES),
    EMPTY_TEXT,
    '## Execution Evidence',
    EMPTY_TEXT,
    '- Preferred lightweight closure evidence for new packages.',
    '- Use the executor plus verifier-fixer shape for real work: one checked `implementation` item, then one checked `verification-fix` item from a separate verifier that may fix in-scope problems.',
    '- Compact checked items use five fields: `action:`, `owner:`, `files-changed:`, `validation:`, and `outcome:`.',
    '- The `verification-fix` item is required before closing packages that change code, tests, scripts, runtime contracts, or tracker truth. It must include `files-changed:` and parent-revalidated focused proof in its validation evidence.',
    '- Pure Q&A and tiny docs-only changes may skip verifier-fixer by using the lightest lane and avoiding package/tracker truth changes.',
    '- Agent identity is optional provenance. Record it when useful for recovery, but do not invent IDs.',
    '- Legacy subagent ledgers are historical provenance only; migrate reopened packages to `## Execution Evidence` at the next closure.',
    EMPTY_TEXT,
    '## Execution Evidence Statuses',
    EMPTY_TEXT,
    '- Legacy `status:` entries remain accepted while packages migrate to the five-field shape.',
    renderEnumList(SUBAGENT_ATTEMPT_STATUSES),
    EMPTY_TEXT,
    '## Causal Governance Outcomes',
    EMPTY_TEXT,
    renderEnumList(CAUSAL_GOVERNANCE_VALID_OUTCOMES),
    EMPTY_TEXT,
    '## Scenario Result Classifications',
    EMPTY_TEXT,
    renderEnumList(SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS),
    EMPTY_TEXT,
    '## Scenario Stop Conditions',
    EMPTY_TEXT,
    renderEnumList(SCENARIO_CAUSAL_CLOSURE_VALID_STOP_CONDITIONS),
    EMPTY_TEXT,
    '## Classification-Only Fast Path',
    EMPTY_TEXT,
    '- Applies when package metadata records `classification-only` as the representative outcome, scenario result classification, or representative residual status.',
    '- Requires implementation paths to stay out of `writeScope` and `commitScope`; keep possible runtime/test/script/report paths in `candidateRuntimeFiles` until promotion.',
    '- Verifier-fixer proof is optional for the fast path while runtime, test, script, report, and tracker-truth paths stay out of writeScope and commitScope. Promotion returns the package to the normal executor plus verifier-fixer path.',
    '- Keep fast-path proof to 2-3 canonical commands: representative evidence, one focused extractor/probe, and validation or causal-model proof.',
    EMPTY_TEXT,
    '## Scenario Frontier Oscillation Fields',
    EMPTY_TEXT,
    renderEnumList(SCENARIO_CAUSAL_CLOSURE_FRONTIER_OSCILLATION_FIELDS),
    EMPTY_TEXT,
    '## Architecture Decision Gate',
    EMPTY_TEXT,
    `- Metadata field: \`${ARCHITECTURE_DECISION_GATE_FIELD}\``,
    EMPTY_TEXT,
    'Statuses:',
    EMPTY_TEXT,
    renderEnumList(ARCHITECTURE_DECISION_GATE_STATUSES),
    EMPTY_TEXT,
    'Triggers:',
    EMPTY_TEXT,
    renderEnumList(ARCHITECTURE_DECISION_GATE_TRIGGERS),
    EMPTY_TEXT,
    'Routes:',
    EMPTY_TEXT,
    renderEnumList(ARCHITECTURE_DECISION_GATE_ROUTES),
    EMPTY_TEXT,
    '## Bounded Progress Mechanisms',
    EMPTY_TEXT,
    renderEnumList(SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISMS),
    EMPTY_TEXT,
    '## Mechanism Card Fields',
    EMPTY_TEXT,
    renderEnumList(MECHANISM_CARD_FIELDS),
    EMPTY_TEXT,
  ].join(NEWLINE);
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  process.stdout.write(renderSchemaReference());
}

export {
  ARCHITECTURE_DECISION_GATE_FIELD,
  ARCHITECTURE_DECISION_GATE_ROUTES,
  ARCHITECTURE_DECISION_GATE_STATUSES,
  ARCHITECTURE_DECISION_GATE_TRIGGERS,
  CAUSAL_GOVERNANCE_PENDING_OUTCOME,
  CAUSAL_GOVERNANCE_VALID_OUTCOMES,
  CANONICAL_WORKFLOW_LANES,
  CLASSIFICATION_EFFICIENCY_ARTIFACT_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_COMMANDS_FIELD,
  CLASSIFICATION_EFFICIENCY_DECISION_RECORD_FIELD,
  CLASSIFICATION_EFFICIENCY_DEFAULT_MODE_FIELD,
  CLASSIFICATION_EFFICIENCY_DEFAULT_MODES,
  CLASSIFICATION_EFFICIENCY_FIELD,
  CLASSIFICATION_EFFICIENCY_FIELDS,
  CLASSIFICATION_EFFICIENCY_PROOF_COMMAND_BUDGET_FIELD,
  CLASSIFICATION_EFFICIENCY_RUNTIME_PROMOTION_RULE_FIELD,
  CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASON_FIELD,
  CLASSIFICATION_EFFICIENCY_SEPARATE_PACKAGE_REASONS,
  CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTION_FIELD,
  CLASSIFICATION_EFFICIENCY_SUCCESSOR_ACTIONS,
  CLOSURE_SUMMARY_EVIDENCE_ARTIFACT_FIELD,
  CLOSURE_SUMMARY_FIELD,
  CLOSURE_SUMMARY_FIELDS,
  CLOSURE_SUMMARY_NEXT_OWNER_BOUNDARY_FIELD,
  CLOSURE_SUMMARY_OBSERVED_MOVEMENT_FIELD,
  CLOSURE_SUMMARY_PREDICTION_ACCURACY_FIELD,
  CLOSURE_SUMMARY_RESULT_FIELD,
  CLOSURE_SUMMARY_SUCCESSOR_REASON_FIELD,
  EXPERIMENT_OUTCOME_DECISION_FIELD,
  EXPERIMENT_OUTCOME_DECISIONS,
  EXPERIMENT_OUTCOME_DISTINGUISHED_HYPOTHESIS_FIELD,
  EXPERIMENT_OUTCOME_EVIDENCE_FIELD,
  EXPERIMENT_OUTCOME_FIELD,
  EXPERIMENT_OUTCOME_FIELDS,
  EXPERIMENT_OUTCOME_NEXT_BOUNDARY_FIELD,
  EXPERIMENT_OUTCOME_NEXT_OWNER_FIELD,
  SYSTEM_THEORY_ARCHITECTURE_GAP_TRIGGERS_FIELD,
  SYSTEM_THEORY_CHANGED_FACTS_FIELD,
  SYSTEM_THEORY_COMPETING_THEORIES_FIELD,
  SYSTEM_THEORY_DOWNSTREAM_SYMPTOMS_FIELD,
  SYSTEM_THEORY_ELIMINATED_THEORIES_FIELD,
  SYSTEM_THEORY_FIELD,
  SYSTEM_THEORY_FIELDS,
  SYSTEM_THEORY_OWNER_BOUNDARY_MAP_FIELD,
  SYSTEM_THEORY_OWNERSHIP_MIGRATION_TRIGGERS_FIELD,
  SYSTEM_THEORY_PHASE_CHAIN_FIELD,
  SYSTEM_THEORY_PROBLEM_STATEMENT_FIELD,
  SYSTEM_THEORY_STABLE_FACTS_FIELD,
  SYSTEM_THEORY_TRANSITION_EXPECTED_EVIDENCE_FIELD,
  SYSTEM_THEORY_TRANSITION_FALSIFIER_FIELD,
  SYSTEM_THEORY_TRANSITION_FIELDS,
  SYSTEM_THEORY_TRANSITION_INPUT_SIGNAL_FIELD,
  SYSTEM_THEORY_TRANSITION_MIGRATION_TRIGGER_FIELD,
  SYSTEM_THEORY_TRANSITION_MISSING_TRANSITION_FIELD,
  SYSTEM_THEORY_TRANSITION_OWNER_FIELD,
  SYSTEM_THEORY_TRANSITION_TABLE_FIELD,
  SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANT_FIELD,
  SYSTEM_THEORY_WHOLE_SYSTEM_INVARIANTS_FIELD,
  SYSTEM_THEORY_INVARIANT_ENTRY_FIELDS,
  SYSTEM_THEORY_INVARIANT_ENTRY_INVARIANT_FIELD,
  SYSTEM_THEORY_INVARIANT_ENTRY_COUPLED_WITH_FIELD,
  SYSTEM_THEORY_INVARIANT_ENTRY_COUPLING_NOTE_FIELD,
  MODEL_THEORY_FIELD,
  MODEL_THEORY_FIELDS,
  MODEL_THEORY_KIND_FIELD,
  MODEL_THEORY_EXECUTABLE_ARTIFACT_FIELD,
  MODEL_THEORY_PROPERTIES_PROVEN_FIELD,
  MODEL_THEORY_ASSUMPTIONS_FIELD,
  MODEL_THEORY_COUNTER_EXAMPLE_HANDLING_FIELD,
  MODEL_THEORY_LINKED_SYSTEM_THEORY_REF_FIELD,
  MODEL_THEORY_VALID_KINDS,
  THEORY_OPTION_LAYER_VOCABULARY,
  SLICE_THEORY_FALSIFIER_FIELD,
  SLICE_THEORY_FIELD,
  SLICE_THEORY_FIELDS,
  SLICE_THEORY_KILL_RULE_FIELD,
  SLICE_THEORY_REPRESENTATIVE_MOVEMENT_FIELD,
  SLICE_THEORY_SELECTED_MECHANISM_FIELD,
  SLICE_THEORY_SELECTED_THEORY_FIELD,
  SLICE_THEORY_SOURCE_TEST_CONTRACT_FIELD,
  SLICE_THEORY_SYSTEM_REF_FIELD,
  SLICE_THEORY_THEORY_FIT_SCORE_FIELD,
  SLICE_THEORY_WRONG_SLICE_TRIGGERS_FIELD,
  THEORY_FIT_SCORE_DOWNSTREAM_RISK_FIELD,
  THEORY_FIT_SCORE_EVIDENCE_FIT_FIELD,
  THEORY_FIT_SCORE_FALSIFIABILITY_FIELD,
  THEORY_FIT_SCORE_FIELDS,
  THEORY_FIT_SCORE_OWNER_BOUNDARY_FIT_FIELD,
  THEORY_FIT_SCORE_REPRESENTATIVE_MOVEMENT_FIELD,
  THEORY_LOOP_ENFORCEMENT_FIELD,
  THEORY_LOOP_ENFORCEMENT_SOURCE_PACKAGE,
  THEORY_LOOP_FIELD,
  THEORY_LOOP_FIELDS,
  THEORY_LOOP_PROMOTED_THEORY_FIELD,
  THEORY_LOOP_RESULT_FIELD,
  THEORY_LOOP_SOURCE_CHANGE_REQUIRED_FIELD,
  THEORY_LOOP_SPRINT_GOAL_DELTA_FIELD,
  THEORY_LOOP_SUCCESSOR_PACKAGE_FIELD,
  THEORY_LOOP_SUCCESSOR_REQUIRED_FIELD,
  THEORY_LOOP_OUTCOME_EVIDENCE_FIELD,
  THEORY_LOOP_SPRINT_CLOSURE_REF_FIELD,
  THEORY_LOOP_OUTCOME_FIELD,
  THEORY_LOOP_OUTCOME_VALUES,
  THEORY_LOOP_JOINT_FALSIFIER_COMMAND_FIELD,
  THEORY_LOOP_ALTERNATING_PAIR_BOUNDARIES_FIELD,
  THEORY_LOOP_GATE_MARKER_FIELD,
  THEORY_LOOP_GATE_MARKER_VALUES,
  BOUNDED_EXPERIMENT_DISCRIMINATOR_FIELD,
  BOUNDED_EXPERIMENT_EXPECTED_METRIC_FIELD,
  BOUNDED_EXPERIMENT_FIELD,
  BOUNDED_EXPERIMENT_FIELDS,
  BOUNDED_EXPERIMENT_HYPOTHESIS_FIELD,
  BOUNDED_EXPERIMENT_INHERITS_FROM_FIELD,
  BOUNDED_EXPERIMENT_KILL_RULE_FIELD,
  BOUNDED_EXPERIMENT_MERGE_REQUIREMENT_FIELD,
  BOUNDED_EXPERIMENT_TIMEBOX_FIELD,
  CORE_LOGIC_BRIEF_FIELDS,
  CORE_LOGIC_BRIEF_REQUIRED_LANES,
  DEFAULT_MODEL_FIT_BY_LANE,
  LANE_MECHANICAL_MAINTENANCE,
  LANE_CAUSAL_ESCALATION,
  LANE_BOUNDED_EXPERIMENT,
  LANE_DIAGNOSTIC_CLASSIFICATION,
  LANE_EXPERIMENT,
  LANE_DISCOVERY,
  LANE_LIGHTWEIGHT_MAINTENANCE,
  LANE_READ_REVIEW_DOC_ONLY,
  LANE_RUNTIME_OWNER_BOUNDARY,
  LANE_SCENARIO_RELEASE_GATE,
  LANE_SINGLE_FILE_RUNTIME,
  LANE_TEST_ONLY_PROOF,
  LANE_FAST_SPIKE,
  LEGACY_WORKFLOW_LANE_ALIASES,
  LOWER_MODEL_WORKFLOW_LANES,
  SPARK_SAFE_WORKFLOW_LANES,
  MODEL_FIT_54_MODEL,
  MODEL_FIT_DEFAULT_FRONTIER_MODEL,
  MODEL_FIT_BOUNDED_EXPERIMENT_SCOPE,
  MODEL_FIT_LEAF_SLICE_SCOPE,
  MODEL_FIT_SPARK_MODEL,
  MODEL_FIT_SPLIT_ALLOWED_DECISION_DEPTH_FIELD,
  MODEL_FIT_SPLIT_CHILD_CANDIDATES_FIELD,
  MODEL_FIT_SPLIT_FIELD,
  MODEL_FIT_SPLIT_FIELDS,
  MODEL_FIT_SPLIT_SAFE_TO_EXECUTE_WHEN_FIELD,
  MODEL_FIT_SPLIT_SPLIT_TRIGGERS_FIELD,
  MODEL_FIT_SPLIT_TARGET_MODEL_FIELD,
  OBSERVABLE_PREDICTION_ACCURACY_FIELD,
  OBSERVABLE_PREDICTION_EVIDENCE_FIELD,
  OBSERVABLE_PREDICTION_FIELD,
  OBSERVABLE_PREDICTION_FIELDS,
  OBSERVABLE_PREDICTION_METRIC_DELTA_FIELD,
  OBSERVABLE_PREDICTION_METRIC_FIELD,
  OBSERVABLE_PREDICTION_OBSERVED_FIELD,
  OBSERVABLE_PREDICTION_PREDICTED_FIELD,
  OUTPUT_PROFILE_MEDIUM,
  RERUN_DECISION_CAUSAL_OUTCOME_FIELD,
  RERUN_DECISION_EXPECTED_DELTA_FIELD,
  RERUN_DECISION_FIELD,
  RERUN_DECISION_FIELDS,
  RERUN_DECISION_NEXT_LANE_FIELD,
  RERUN_DECISION_REQUIRED_REFRESH_COMMANDS_FIELD,
  RERUN_DECISION_ROUTE_BOUNDARY_FIELD,
  RERUN_DECISION_ROUTE_DOMINANT_REASON_FIELD,
  RERUN_DECISION_ROUTE_OWNER_FIELD,
  RERUN_DECISION_SOURCE_ARTIFACT_FIELD,
  RERUN_DECISION_STOP_MODE_FIELD,
  REQUIRED_PRE_IMPL_PROBE_ARTIFACT_FIELD,
  REQUIRED_PRE_IMPL_PROBE_COMMAND_FIELD,
  REQUIRED_PRE_IMPL_PROBE_FIELD,
  REQUIRED_PRE_IMPL_PROBE_FIELDS,
  REQUIRED_PRE_IMPL_PROBE_REASON_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_EVIDENCE_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FIELDS,
  OWNER_BOUNDARY_MIGRATION_PROOF_FROM_BOUNDARY_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_FROM_OWNER_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_REASON_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_TO_BOUNDARY_FIELD,
  OWNER_BOUNDARY_MIGRATION_PROOF_TO_OWNER_FIELD,
  INHERITS_CONTEXT_FIELD,
  INHERITS_CONTEXT_FIELDS,
  SCENARIO_CAUSAL_CLOSURE_PROGRESS_MECHANISMS,
  SCENARIO_CAUSAL_CLOSURE_FRONTIER_OSCILLATION_FIELDS,
  SCENARIO_CAUSAL_CLOSURE_HANDOFF_INVARIANT_FIELD,
  SCENARIO_CAUSAL_CLOSURE_OSCILLATION_CHECK_FIELD,
  SCENARIO_CAUSAL_CLOSURE_RECENT_FRONTIER_HISTORY_FIELD,
  SCENARIO_CAUSAL_CLOSURE_VALID_RESULT_CLASSIFICATIONS,
  SCENARIO_CAUSAL_CLOSURE_VALID_STOP_CONDITIONS,
  REPRESENTATIVE_RESIDUAL_FIELD,
  REPRESENTATIVE_RESIDUAL_FIELDS,
  SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
  SCOPE_FIELD_COMMIT_SCOPE,
  SCOPE_FIELD_GENERATED_FILES,
  SCOPE_FIELD_HANDOFF_FILES,
  SCOPE_FIELD_WRITE_SCOPE,
  THEORY_LEDGER_REFS_FIELD,
  MECHANISM_CARD_FIELD,
  MECHANISM_CARD_FIELDS,
  SUBAGENT_OPTIONAL_LANES,
  SUBAGENT_ATTEMPT_STATUSES,
  SUBAGENT_UNAVAILABLE_STATES,
  VALID_PACKAGE_STATUSES,
  VALID_OUTPUT_PROFILES,
  VALIDATION_TIER_FIELD,
  VALIDATION_TIERS,
  VALIDATION_PHASES,
  VALIDATION_PHASE_CLOSURE,
  VALIDATION_PHASE_ENTRY,
  VALIDATION_PHASE_PROBE,
  VALIDATION_PHASE_PRE_IMPL,
  WORK_PACKAGE_SCOPE_FIELDS,
  WORKFLOW_LANES,
  WORK_PACKAGE_METADATA_SCHEMA,
  WORK_PACKAGE_METADATA_SCHEMA_V1,
  METADATA_FIELD_STABILITY_CREDIT,
  METADATA_FIELD_WHY_HIGHEST_LEVERAGE_NOW,
  METADATA_FIELD_REPRESENTATIVE_RERUN_CADENCE,
  METADATA_FIELD_CODE_QUALITY_ADMISSION,
  STABILITY_CREDIT_VALID_VALUES,
  REPRESENTATIVE_RERUN_CADENCE_VALID_VALUES,
  CODE_QUALITY_ADMISSION_REASONS,
  coreLogicBriefRequiredForLane,
  defaultOutputProfileForLane,
  defaultModelFitForLane,
  normalizeMetadata,
  renderSchemaReference,
};
