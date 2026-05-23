import {CAUSAL_DECISION_CONTRACT_INVALID_CONTENT, CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA, CAUSAL_DECISION_CONTRACT_VALID_CONTENT, CAUSAL_GOVERNANCE_INVALID_METADATA, CAUSAL_GOVERNANCE_MISSING_METADATA, CAUSAL_GOVERNANCE_VALID_METADATA, CLASSIFICATION_EFFICIENCY_VALID_METADATA, CLASSIFICATION_ONLY_FAST_PATH_METADATA, CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA, CORE_LOGIC_BRIEF_GENERIC_CONTENT, CORE_LOGIC_BRIEF_INCOMPLETE_CONTENT, CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT, CORE_LOGIC_BRIEF_VALID_CONTENT, DECISION_EXPERIMENT_GATE_INVALID_CONTENT, DECISION_EXPERIMENT_GATE_VALID_CONTENT, FIX_AGENT_ID, IMPLEMENTATION_AGENT_ID, LANE_BOUNDED_EXPERIMENT, LANE_CAUSAL_ESCALATION, LANE_DIAGNOSTIC_CLASSIFICATION, LANE_EXPERIMENT, LANE_LIGHTWEIGHT_MAINTENANCE, LANE_MECHANICAL_MAINTENANCE, LANE_READ_REVIEW_DOC_ONLY, LANE_RUNTIME_OWNER_BOUNDARY, LANE_SINGLE_FILE_RUNTIME, LANE_TEST_ONLY_PROOF, MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT, MODEL_FIT_MISSING_CONTENT, MODEL_FIT_VALID_SPARK_SAFE_CONTENT, REPRESENTATIVE_RESIDUAL_INVALID_METADATA, REPRESENTATIVE_RESIDUAL_MISSING_METADATA, REPRESENTATIVE_RESIDUAL_VALID_METADATA, RERUN_DECISION_VALID_METADATA, REVIEW_AGENT_ID, SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA, SCENARIO_CAUSAL_CLOSURE_MISSING_METADATA, SCENARIO_CAUSAL_CLOSURE_VALID_METADATA, SPRINT_STRATEGY_BRIEF_INCOMPLETE_CONTENT, SPRINT_STRATEGY_BRIEF_VALID_CONTENT, TEST_COMMIT_SHA, TEST_PUSH_TARGET, TEST_THEORY_LEDGER_REF, WORK_TRACKER_ACTIVE_DOCTOR_FILE, WORK_TRACKER_ACTIVE_STATUS, WORK_TRACKER_ATTEMPT_LEDGER_BAD_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_CLEAN_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_CODEX_NAMED_AGENT_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_GENERIC_IDENTITY_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_NOT_NEEDED_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_OPEN_PARTIAL_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_PARTIAL_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_SUPERSEDED_CONTENT, WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT, WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT, WORK_TRACKER_COMMIT_LEDGER_LEGACY_VALID_CONTENT, WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT, WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT, WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT, WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN, WORK_TRACKER_DOCTOR_CONTENT, WORK_TRACKER_DONE_STATUS, WORK_TRACKER_DONE_TEST_FILE, WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_FIVE_FIELD_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_OPEN_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_UNVALIDATED_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_NO_CHANGES_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_WITH_AGENT_CONTENT, WORK_TRACKER_FUTURE_DONE_STRICT_CONTENT, WORK_TRACKER_FUTURE_DONE_TEST_FILE, WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT, WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT, WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT, WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT, WORK_TRACKER_LEDGER_CLEAN_CONTENT, WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT, WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT, WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT, WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT, WORK_TRACKER_LEDGER_LOCAL_PATH_CONTENT, WORK_TRACKER_LEDGER_LOCAL_PATH_TEST_FILE, WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT, WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT, WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT, WORK_TRACKER_LEDGER_NUMBERED_PRE_IMPL_CONTENT, WORK_TRACKER_LEDGER_OPEN_CONTENT, WORK_TRACKER_LEDGER_PRE_IMPL_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_METADATA_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_RUNTIME_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_WRONG_AGENT_CONTENT, WORK_TRACKER_LEDGER_TEST_FILE, WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT, WORK_TRACKER_LEDGER_UNVALIDATED_IMPLEMENTATION_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_BAD_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_CLEAN_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_NOT_NEEDED_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_OPEN_CONTENT, assert, buildCurrentBlockerPayload, buildPackageDoctorLines, describe, findActivePackageLinkInSprint, isGeneratedCurrentBlockerPath, it, metadataHasClassificationOnlyOutcome, metadataRequiresSubagentSequencing, metadataUsesClassificationOnlyFastPath, metadataUsesPureClassificationFastPath, path, renderCurrentBlockerMarkdown, renderCurrentEdgeCardSection, resolveSprintPackageReference, upsertSprintCurrentEdgeCard, validateActiveWorkReferences, validateCausalDecisionContract, validateCausalGovernanceContract, validateClassificationEfficiencyContract, validateCommitAndPushLedger, validateContractProofRequirement, validateCoreLogicBrief, validateCurrentBlockerPayloadFreshness, validateCurrentBlockerSnapshot, validateDecisionExperimentGate, validateExecutionEvidenceLedger, validateExperimentOutcomeContract, validateFrontierOscillationContract, validateModelFitContract, validateObservablePredictionContract, validatePackageMetadataShape, validateProbePackageContract, validateRepresentativeResidualContract, validateRequiredPreImplProbeContract, validateRerunDecisionContract, validateSameFrontierStopContract, validateScenarioCausalClosureContract, validateScenarioFrontierOwnerBoundaryContract, validateSprintCurrentEdgeCard, validateSprintStrategyBrief, validateSubagentAttemptLedger, validateSubagentProgressLedger, validateSubagentSequencingLedger} from './work-tracker-subagent-ledger-fixtures.js';

describe('work tracker commit and push ledger validation', () => {
  it('grandfathers historical done packages without commit and push proof', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {
        requiresLedger: true,
        allowMissingHistoricalCommitLedger: true,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('reports done metadata-bearing packages without commit and push proof', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Commit And Push Ledger is required/u);
  });

  it('accepts complete commit and push proof', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('ignores inline mentions of ledger headings before the real heading', () => {
    const errors = validateCommitAndPushLedger(
      [
        '# Test Package',
        '',
        'This prose mentions `## Commit And Push Ledger` before closure.',
        '',
        WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT,
      ].join('\n'),
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('accepts the legacy closure commit proof heading as an alias', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_LEGACY_VALID_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('allows pending commit proof only when the package is still open', () => {
    const openErrors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {allowPendingCommitLedger: true},
    );
    const closedErrors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(openErrors, []);
    assert.match(closedErrors.join('\n'), /must be a git commit SHA/u);
  });

  it('reports placeholders in commit and push proof fields', () => {
    const errors = validateCommitAndPushLedger(
      WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: true},
    );

    assert.match(errors.join('\n'), /placeholder/u);
    assert.match(errors.join('\n'), /must be a git commit SHA/u);
    assert.match(errors.join('\n'), /must be <remote>\/<branch>/u);
    assert.match(errors.join('\n'), /must be yes/u);
  });
});

describe('work tracker core logic brief validation', () => {
  it('requires Core Logic Brief when strict lanes ask for it', () => {
    const errors = validateCoreLogicBrief(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Core Logic Brief section is required/u);
  });

  it('accepts not-needed only when the lane does not require core logic', () => {
    const optionalErrors = validateCoreLogicBrief(
      CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: false},
    );
    const requiredErrors = validateCoreLogicBrief(
      CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(optionalErrors, []);
    assert.match(requiredErrors.join('\n'), /cannot be not-needed/u);
  });

  it('accepts a complete Core Logic Brief', () => {
    const errors = validateCoreLogicBrief(
      CORE_LOGIC_BRIEF_VALID_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects generic Core Logic Brief scaffolding before implementation', () => {
    const errors = validateCoreLogicBrief(
      CORE_LOGIC_BRIEF_GENERIC_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, rejectGeneric: true},
    );

    assert.match(errors.join('\n'), /must name the concrete decision model/u);
  });

  it('reports missing placeholders and vague Core Logic Brief fields', () => {
    const errors = validateCoreLogicBrief(
      CORE_LOGIC_BRIEF_INCOMPLETE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.match(errors.join('\n'), /Canonical outcome/u);
    assert.match(errors.join('\n'), /Inputs\/signals/u);
    assert.match(errors.join('\n'), /State model or invariant/u);
    assert.match(errors.join('\n'), /Proof mapping/u);
  });
});

describe('work tracker causal decision contract validation', () => {
  it('requires Causal Decision Contract when strict active packages ask for it', () => {
    const errors = validateCausalDecisionContract(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Causal Decision Contract section is required/u);
  });

  it('accepts a concrete Causal Decision Contract with oscillation guard', () => {
    const errors = validateCausalDecisionContract(
      CAUSAL_DECISION_CONTRACT_VALID_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('reports placeholders, missing decision rows, and non-command probes', () => {
    const errors = validateCausalDecisionContract(
      CAUSAL_DECISION_CONTRACT_INVALID_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /at least one concrete decision row/u);
    assert.match(errors.join('\n'), /Anti-symptom rationale/u);
    assert.match(errors.join('\n'), /must name a focused command/u);
    assert.match(errors.join('\n'), /Competing explanations/u);
    assert.match(errors.join('\n'), /Systemic interaction scan/u);
    assert.match(errors.join('\n'), /Ping-pong stop rule/u);
    assert.match(errors.join('\n'), /Oscillation guard/u);
  });

  it('accepts missing Causal Decision Contract section when causalGovernance is present in metadata', () => {
    const errors = validateCausalDecisionContract(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      {
        ...CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
        causalGovernance: {
          hypothesis: 'H1',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });
});

describe('work tracker decision experiment gate validation', () => {
  it('requires Decision Experiment Gate when strict active packages ask for it', () => {
    const errors = validateDecisionExperimentGate(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Decision Experiment Gate section is required/u);
  });

  it('accepts a concrete Decision Experiment Gate', () => {
    const errors = validateDecisionExperimentGate(
      DECISION_EXPERIMENT_GATE_VALID_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('reports placeholders, non-command probes, vague metrics, and missing stop rules', () => {
    const errors = validateDecisionExperimentGate(
      DECISION_EXPERIMENT_GATE_INVALID_CONTENT,
      CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /Decision question/u);
    assert.match(errors.join('\n'), /Architecture review/u);
    assert.match(errors.join('\n'), /Pre-edit focused probe must name a focused command/u);
    assert.match(errors.join('\n'), /Success metrics/u);
    assert.match(errors.join('\n'), /Representative rerun must name a focused command/u);
    assert.match(errors.join('\n'), /Kill rule/u);
  });

  it('accepts missing Decision Experiment Gate section when architectureDecisionGate is present in metadata with choices', () => {
    const errors = validateDecisionExperimentGate(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      {
        ...CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
        architectureDecisionGate: {
          choices: [{ id: 'choice-1' }],
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('requires a hypothesis discriminator for watching frontier oscillation', () => {
    const metadata = {
      ...CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA,
      architectureDecisionGate: {
        status: 'watching',
        trigger: 'frontier-oscillation',
        triggerEvidence: ['frontier returned to the same owner'],
      },
    };

    const vagueErrors = validateDecisionExperimentGate(
      DECISION_EXPERIMENT_GATE_VALID_CONTENT,
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );
    const discriminatingErrors = validateDecisionExperimentGate(
      DECISION_EXPERIMENT_GATE_VALID_CONTENT.replace(
        /Competing hypotheses: .+/u,
        'Competing hypotheses: H1 owner wake missing predicts pending=1; ' +
          'H2 active-gate lag predicts pending=0 but snapshot stale; ' +
          'H3 fixture drift predicts pending=1 only in replay; ' +
          'different observable chooses the route.',
      ),
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(vagueErrors.join('\n'), /hypothesis discriminator/u);
    assert.deepEqual(discriminatingErrors, []);
  });
});

describe('work tracker sprint strategy brief validation', () => {
  it('requires Sprint Strategy Brief when active sprints ask for it', () => {
    const errors = validateSprintStrategyBrief(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      'work/sprints/active-test-sprint.md',
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Sprint Strategy Brief section is required/u);
  });

  it('accepts a complete Sprint Strategy Brief', () => {
    const errors = validateSprintStrategyBrief(
      SPRINT_STRATEGY_BRIEF_VALID_CONTENT,
      'work/sprints/active-test-sprint.md',
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('reports missing placeholders and vague Sprint Strategy Brief fields', () => {
    const errors = validateSprintStrategyBrief(
      SPRINT_STRATEGY_BRIEF_INCOMPLETE_CONTENT,
      'work/sprints/active-test-sprint.md',
      {requiresLedger: true},
    );
    const message = errors.join('\n');

    assert.match(message, /Goal state/u);
    assert.match(message, /Current causal thesis/u);
    assert.match(message, /Confidence and evidence/u);
    assert.match(message, /Expected green path/u);
  });
});

describe('work tracker rerun decision validation', () => {
  it('requires rerun decision on active diagnostic successor packages', () => {
    const errors = validateRerunDecisionContract(
      {
        ...RERUN_DECISION_VALID_METADATA,
        rerunDecision: undefined,
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /metadata rerunDecision is required/u);
  });

  it('accepts a concrete rerun decision with refresh commands', () => {
    const errors = validateRerunDecisionContract(
      RERUN_DECISION_VALID_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('requires classification efficiency on pure classification packages', () => {
    const errors = validateClassificationEfficiencyContract(
      {
        ...RERUN_DECISION_VALID_METADATA,
        classificationEfficiency: undefined,
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /metadata classificationEfficiency is required/u);
  });

  it('accepts pure classification packages with capped successor routing', () => {
    const errors = validateClassificationEfficiencyContract(
      {
        ...RERUN_DECISION_VALID_METADATA,
        rerunDecision: {
          ...RERUN_DECISION_VALID_METADATA.rerunDecision,
          nextLane: LANE_RUNTIME_OWNER_BOUNDARY,
        },
        ...CLASSIFICATION_EFFICIENCY_VALID_METADATA,
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('routes stable owner-boundary classification to runtime successors', () => {
    const errors = validateClassificationEfficiencyContract(
      {
        ...RERUN_DECISION_VALID_METADATA,
        ...CLASSIFICATION_EFFICIENCY_VALID_METADATA,
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /rerunDecision\.nextLane must be runtime-owner-boundary/u);
  });

  it('rejects rerun decisions that omit required refresh steps', () => {
    const errors = validateRerunDecisionContract(
      {
        ...RERUN_DECISION_VALID_METADATA,
        rerunDecision: {
          ...RERUN_DECISION_VALID_METADATA.rerunDecision,
          requiredRefreshCommands: [
            'npm run work:package:route-after-rerun -- --artifact test-output/reports/rerun.report.json',
          ],
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /requiredRefreshCommands/u);
    assert.match(errors.join('\n'), /Current Edge Card/u);
  });

  it('stops same-frontier no-reduction packages without a selected gate', () => {
    const sameFrontierMetadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      scenarioCausalClosure: {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
        resultClassification: 'same-frontier',
        stopCondition: 'continue-local-fix',
      },
    };

    const errors = validateSameFrontierStopContract(
      sameFrontierMetadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /same-frontier rerun without concrete reduction/u);
  });

  it('allows same-frontier no-reduction packages with an autonomous architecture experiment', () => {
    const sameFrontierMetadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      scenarioCausalClosure: {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
        resultClassification: 'same-frontier',
        stopCondition: 'architecture-gap-stop',
      },
      architectureDecisionGate: {
        status: 'selected',
        trigger: 'frontier-oscillation',
        triggerEvidence: ['same-frontier returned with no reduction'],
        choices: [
          {
            id: 'open-architecture-package',
            summary: 'Open an autonomous architecture experiment.',
            route: 'architecture-package',
            proof: ['npm run work:evidence-summary -- report.json'],
          },
        ],
        selectedChoice: 'open-architecture-package',
        nextAction: 'Open the autonomous architecture experiment.',
      },
    };

    const errors = validateSameFrontierStopContract(
      sameFrontierMetadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects same-frontier no-reduction packages that select another local proof', () => {
    const sameFrontierMetadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      scenarioCausalClosure: {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
        resultClassification: 'same-frontier',
        stopCondition: 'continue-local-fix',
      },
      architectureDecisionGate: {
        status: 'selected',
        trigger: 'frontier-oscillation',
        triggerEvidence: ['same-frontier returned with no reduction'],
        choices: [
          {
            id: 'continue-local-proof',
            summary: 'Try one more local proof.',
            route: 'continue-local-proof',
            proof: ['npm run work:evidence-summary -- report.json'],
          },
        ],
        selectedChoice: 'continue-local-proof',
        nextAction: 'Try another local proof.',
      },
    };

    const errors = validateSameFrontierStopContract(
      sameFrontierMetadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /autonomous architecture experiment/u);
  });

  it('rejects same-frontier no-reduction packages that select owner migration', () => {
    const sameFrontierMetadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      scenarioCausalClosure: {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
        resultClassification: 'same-frontier',
        stopCondition: 'continue-local-fix',
      },
      architectureDecisionGate: {
        status: 'selected',
        trigger: 'frontier-oscillation',
        triggerEvidence: ['same-frontier returned with no reduction'],
        choices: [
          {
            id: 'migrate-owner-boundary',
            summary: 'Migrate to another owner boundary.',
            route: 'owner-boundary-migration',
            proof: ['npm run work:evidence-summary -- report.json'],
          },
        ],
        selectedChoice: 'migrate-owner-boundary',
        nextAction: 'Migrate to another owner boundary.',
      },
    };

    const errors = validateSameFrontierStopContract(
      sameFrontierMetadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.match(errors.join('\n'), /route=architecture-package/u);
  });

  it('rejects a third same-frontier runtime package at entry', () => {
    const metadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      owner: 'operation_workflow_owner',
      boundary: 'workflow_progress',
      scenarioCausalClosure: {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
        resultClassification: 'pending-before-probe',
      },
    };
    const history = [
      {
        filePath: 'work/packages/done-20260518-workflow-a.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'operation_workflow_owner',
          boundary: 'workflow_progress',
          scenarioCausalClosure: {resultClassification: 'same-frontier'},
        },
      },
      {
        filePath: 'work/packages/done-20260519-workflow-b.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'operation_workflow_owner',
          boundary: 'workflow_progress',
          scenarioCausalClosure: {resultClassification: 'same-frontier'},
        },
      },
    ];

    const errors = validateSameFrontierStopContract(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        phase: 'entry',
        packageHistoryEntries: history,
      },
    );

    assert.match(errors.join('\n'), /two-shot same-frontier rule/u);
    assert.match(errors.join('\n'), /autonomous architecture experiment/u);
  });

  it('does not count prior same-frontier entries with concrete movement', () => {
    const metadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      owner: 'operation_workflow_owner',
      boundary: 'workflow_progress',
    };
    const history = [
      {
        filePath: 'work/packages/done-20260518-workflow-a.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'operation_workflow_owner',
          boundary: 'workflow_progress',
          scenarioCausalClosure: {
            resultClassification: 'same-frontier',
            expectedObservableTransition:
              'pendingReconcileCount 2 -> 1 reduced shape',
          },
          observablePrediction: {
            accuracy: 'partial',
            observed: 'pendingReconcileCount 2 -> 1',
          },
        },
      },
      {
        filePath: 'work/packages/done-20260519-workflow-b.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'sibling_owner',
          boundary: 'sibling_boundary',
          scenarioCausalClosure: {resultClassification: 'migrated'},
        },
      },
    ];

    const errors = validateSameFrontierStopContract(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        phase: 'entry',
        packageHistoryEntries: history,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('does not block a sibling-owner migration package', () => {
    const metadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      owner: 'sibling_owner',
      boundary: 'sibling_boundary',
    };
    const history = [
      {
        filePath: 'work/packages/done-20260518-workflow-a.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'operation_workflow_owner',
          boundary: 'workflow_progress',
          scenarioCausalClosure: {resultClassification: 'same-frontier'},
        },
      },
      {
        filePath: 'work/packages/done-20260519-workflow-b.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'operation_workflow_owner',
          boundary: 'workflow_progress',
          scenarioCausalClosure: {resultClassification: 'same-frontier'},
        },
      },
    ];

    const errors = validateSameFrontierStopContract(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        phase: 'entry',
        packageHistoryEntries: history,
      },
    );

    assert.deepEqual(errors, []);
  });
});

describe('work tracker observable prediction validation', () => {
  it('requires pre-registered prediction metadata on experiment packages', () => {
    const errors = validateObservablePredictionContract(
      {status: WORK_TRACKER_ACTIVE_STATUS, lane: LANE_EXPERIMENT},
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'pre-impl'},
    );

    assert.match(errors.join('\n'), /observablePrediction is required/u);
  });

  it('requires prediction metadata when runtime packages predict movement', () => {
    const errors = validateObservablePredictionContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        scenarioCausalClosure: {
          expectedObservableTransition: 'frontier reduces from 3 to 1 blockers',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'pre-impl'},
    );

    assert.match(errors.join('\n'), /observablePrediction is required/u);
  });

  it('compares predicted and observed transitions at closure', () => {
    const mismatchErrors = validateObservablePredictionContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        observablePrediction: {
          metric: 'frontier',
          predicted: 'frontier=operation_workflow_owner/workflow_progress',
          observed: 'frontier=startup_active_gate_owner/snapshot_coverage',
          accuracy: 'matched',
          evidence: 'npm test -- test/rebalancer/probe.test.js',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );
    const matchedErrors = validateObservablePredictionContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        observablePrediction: {
          metric: 'frontier',
          predicted: 'frontier=operation_workflow_owner/workflow_progress',
          observed: 'frontier=operation_workflow_owner/workflow_progress',
          accuracy: 'matched',
          evidence: 'npm test -- test/rebalancer/probe.test.js',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );

    assert.match(mismatchErrors.join('\n'), /predicted and observed transitions differ/u);
    assert.deepEqual(matchedErrors, []);
  });
});

describe('work tracker experiment outcome validation', () => {
  it('requires information learned at experiment closure', () => {
    const missingErrors = validateExperimentOutcomeContract(
      {status: WORK_TRACKER_ACTIVE_STATUS, lane: LANE_EXPERIMENT},
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );
    const validErrors = validateExperimentOutcomeContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        experimentOutcome: {
          distinguishedHypothesis: 'H2',
          decision: 'open-runtime-owner-boundary',
          nextOwner: 'operation_workflow_owner',
          nextBoundary: 'workflow_progress',
          evidence: 'npm test -- test/rebalancer/probe.test.js',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );
    const architectureExperimentErrors = validateExperimentOutcomeContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        experimentOutcome: {
          distinguishedHypothesis: 'H1',
          decision: 'open-architecture-experiment',
          evidence: 'npm test -- test/rebalancer/probe.test.js',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );
    const incompleteErrors = validateExperimentOutcomeContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        experimentOutcome: {
          distinguishedHypothesis: 'evidence-incomplete',
          decision: 'evidence-incomplete',
          evidence: 'test-output/reports/probe.report.json',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
      {status: WORK_TRACKER_ACTIVE_STATUS, phase: 'closure'},
    );

    assert.match(missingErrors.join('\n'), /experimentOutcome is required/u);
    assert.deepEqual(validErrors, []);
    assert.deepEqual(architectureExperimentErrors, []);
    assert.deepEqual(incompleteErrors, []);
  });
});

describe('work tracker probe package validation', () => {
  it('requires experiment metadata and blocks runtime source writes', () => {
    const errors = validateProbePackageContract(
      '# Probe\n',
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        proof: [],
        writeScope: ['src/rebalancer/runtime.js'],
      },
    ).join('\n');
    const validErrors = validateProbePackageContract(
      '# Probe\n',
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        proof: ['npm test -- test/rebalancer/probe.test.js'],
        writeScope: ['test/rebalancer/probe.test.js'],
        boundedExperiment: {
          hypothesis: 'H1 vs H2 vs H3',
          hypothesisDiscriminator:
            'H1 predicts A; H2 predicts B; H3 predicts C',
          expectedMetric: 'A vs B vs C',
          inheritsFrom: 'work/packages/active-predecessor.md',
          timebox: '24h',
          mergeRequirement: 'probe distinguishes H1/H2/H3',
          killRule: 'stop on non-discriminating evidence',
        },
        validationTier: 'single-owner',
        observablePrediction: {
          metric: 'frontier',
          predicted: 'H2 observable',
          metricDelta: 1,
        },
      },
    );
    const longExperimentErrors = validateProbePackageContract(
      Array.from({length: 40}, (_value, index) => `line ${index}`).join('\n'),
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        proof: ['npm test -- test/rebalancer/probe.test.js'],
        writeScope: ['test/rebalancer/probe.test.js'],
        modelFit: {packageClass: 'experiment'},
        boundedExperiment: {
          hypothesis: 'H1 vs H2 vs H3',
          hypothesisDiscriminator:
            'H1 predicts A; H2 predicts B; H3 predicts C',
          expectedMetric: 'A vs B vs C',
          inheritsFrom: 'work/packages/active-predecessor.md',
          timebox: '24h',
          mergeRequirement: 'probe distinguishes H1/H2/H3',
          killRule: 'stop on non-discriminating evidence',
        },
        validationTier: 'single-owner',
        observablePrediction: {
          metric: 'frontier',
          predicted: 'H2 observable',
        },
      },
    );
    const compactLongErrors = validateProbePackageContract(
      Array.from({length: 40}, (_value, index) => `line ${index}`).join('\n'),
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_EXPERIMENT,
        proof: ['npm test -- test/rebalancer/probe.test.js'],
        writeScope: ['test/rebalancer/probe.test.js'],
        modelFit: {packageClass: 'compact-probe'},
        boundedExperiment: {
          hypothesis: 'H1 vs H2 vs H3',
          hypothesisDiscriminator:
            'H1 predicts A; H2 predicts B; H3 predicts C',
          expectedMetric: 'A vs B vs C',
          inheritsFrom: 'work/packages/active-predecessor.md',
          timebox: '24h',
          mergeRequirement: 'probe distinguishes H1/H2/H3',
          killRule: 'stop on non-discriminating evidence',
        },
        validationTier: 'single-owner',
        observablePrediction: {
          metric: 'frontier',
          predicted: 'H2 observable',
        },
      },
    ).join('\n');

    assert.match(errors, /must use lane experiment/u);
    assert.match(errors, /metadata.proof must name/u);
    assert.match(errors, /must not include src\/ runtime files/u);
    assert.deepEqual(validErrors, []);
    assert.deepEqual(longExperimentErrors, []);
    assert.match(compactLongErrors, /keep probe packages at or below/u);
  });
});

describe('work tracker required pre-implementation probe validation', () => {
  it('requires metadata-declared fixture proof before runtime source edits', () => {
    const missingErrors = validateRequiredPreImplProbeContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        proof: ['npm test -- test/rebalancer/runtime.test.js'],
        writeScope: ['src/rebalancer/runtime.js'],
        requiredPreImplProbe: {
          command:
            'npm run analyze:topology-convergence -- test/scripts/fixtures/current.json --handoff-probe',
          artifact: 'test/scripts/fixtures/current.json',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
    ).join('\n');
    const validErrors = validateRequiredPreImplProbeContract(
      {
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        proof: [
          'npm run analyze:topology-convergence -- test/scripts/fixtures/current.json --handoff-probe',
          'npm test -- test/rebalancer/runtime.test.js',
        ],
        writeScope: ['src/rebalancer/runtime.js'],
        requiredPreImplProbe: {
          command:
            'npm run analyze:topology-convergence -- test/scripts/fixtures/current.json --handoff-probe',
          artifact: 'test/scripts/fixtures/current.json',
        },
      },
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(missingErrors, /required fixture\/probe artifact/u);
    assert.match(missingErrors, /required fixture\/probe command/u);
    assert.deepEqual(validErrors, []);
  });
});

describe('work tracker model fit validation', () => {
  it('requires model fit on active metadata-bearing packages', () => {
    const errors = validateModelFitContract(
      MODEL_FIT_MISSING_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Model Fit section is required/u);
  });

  it('accepts a complete Spark-safe leaf-slice contract', () => {
    const errors = validateModelFitContract(
      MODEL_FIT_VALID_SPARK_SAFE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects Spark-safe packages without Spark model, leaf scope, or bounded language',
    () => {
      const errors = validateModelFitContract(
        MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {requiresLedger: true},
      );

      assert.match(errors.join('\n'), /gpt-5\.3-codex-spark/u);
      assert.match(errors.join('\n'), /leaf-slice/u);
      assert.match(errors.join('\n'), /open-ended frontier language/u);
    });
});

describe('work tracker causal governance validation', () => {
  it('requires causal governance on active scenario-driven packages', () => {
    const errors = validateCausalGovernanceContract(
      CAUSAL_GOVERNANCE_MISSING_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /metadata causalGovernance is required/u);
  });

  it('accepts complete causal governance with a pending active-package rerun', () => {
    const errors = validateCausalGovernanceContract(
      CAUSAL_GOVERNANCE_VALID_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects placeholders, missing causal-model checks, and pending closure outcomes',
    () => {
      const errors = validateCausalGovernanceContract(
        CAUSAL_GOVERNANCE_INVALID_METADATA,
        WORK_TRACKER_DONE_TEST_FILE,
        {requiresLedger: true, status: WORK_TRACKER_DONE_STATUS},
      );

      assert.match(errors.join('\n'), /hypothesis/u);
      assert.match(errors.join('\n'), /expectedCausalModelChange/u);
      assert.match(errors.join('\n'), /causalDebt/u);
      assert.match(errors.join('\n'), /cannot close scenario-driven package/u);
      assert.match(errors.join('\n'), /analyze:causal-model/u);
    });
});

describe('work tracker representative residual validation', () => {
  it('requires representative residual metadata when active diagnostics keeps the sprint residual live',
    () => {
      const errors = validateRepresentativeResidualContract(
        REPRESENTATIVE_RESIDUAL_MISSING_METADATA,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
      );

      assert.equal(errors.length, 1);
      assert.match(errors[0], /representativeResidual is required/u);
      assert.match(errors[0], /sprint representative residual live/u);
    });

  it('accepts concrete representative residual metadata', () => {
    const errors = validateRepresentativeResidualContract(
      REPRESENTATIVE_RESIDUAL_VALID_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('rejects placeholder representative residual fields', () => {
    const errors = validateRepresentativeResidualContract(
      REPRESENTATIVE_RESIDUAL_INVALID_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );
    const rendered = errors.join('\n');

    assert.match(rendered, /representativeResidual.status/u);
    assert.match(rendered, /representativeResidual.artifact/u);
    assert.match(rendered, /representativeResidual.frontier/u);
    assert.match(rendered, /representativeResidual.owner/u);
    assert.match(rendered, /representativeResidual.boundary/u);
    assert.match(rendered, /representativeResidual.dominantReason/u);
    assert.match(rendered, /representativeResidual.nextAction/u);
    assert.match(rendered, /scenario must match/u);
  });

  it('surfaces missing representative residual metadata in package doctor output',
    () => {
      const metadata = {
        schema: 'work-package-v1',
        status: 'active',
        lane: 'causal-escalation',
        scenario: 'rolling-restart',
        owner: 'diagnostics_owner',
        boundary: 'residual_inventory',
        dominantReason: 'residual_inventory_incomplete',
        currentState:
          'The sprint representative rolling-restart residual remains red.',
        nextAction: 'Record the residual before runtime fixes continue.',
        proof: ['node --test test/scripts/work-tracker-subagent-ledger.test.js'],
        writeScope: ['work/packages/active-test-package.md'],
        commitScope: ['work/packages/active-test-package.md'],
        modelFit: {
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'owner-boundary-contraction/current-frontier',
          outputProfile: 'medium',
          escalationTriggers: ['representative scenario evidence changes'],
        },
        causalGovernance: CAUSAL_GOVERNANCE_VALID_METADATA.causalGovernance,
        scenarioCausalClosure: {
          ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
          currentFirstFrontier:
            'diagnostics_owner / residual_inventory package-local proof; ' +
            'the sprint representative residual remains red.',
        },
      };
      const content = [
        '# Test Package',
        '',
        '<!-- work-package',
        JSON.stringify(metadata, null, 2),
        '-->',
        '',
        '## Model Fit',
        '',
        '- Package class: `representative-frontier-closure`',
        '- Intended minimum model: `gpt-5.3-codex`',
        '- Scope shape: `owner-boundary-contraction/current-frontier`',
        '- Output profile: `medium`',
        '- Owned files: `work/packages/active-test-package.md`',
        '- Forbidden files: `src/`, `test/distributed/harness/`',
        '- Frozen decisions: diagnostics package keeps scope fixed.',
        '- Escalation triggers: representative scenario evidence changes.',
        '- Focused proof: `node --test test/scripts/work-tracker-subagent-ledger.test.js`',
        '',
        WORK_TRACKER_LEDGER_CLEAN_CONTENT.split('\n').slice(2).join('\n'),
      ].join('\n');
      const report = buildPackageDoctorLines(
        WORK_TRACKER_LEDGER_TEST_FILE,
        content,
      );

      assert.match(
        report.errors.join('\n'),
        /metadata representativeResidual is required/u,
      );
    });
});
