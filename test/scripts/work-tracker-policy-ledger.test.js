import {CAUSAL_DECISION_CONTRACT_INVALID_CONTENT, CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA, CAUSAL_DECISION_CONTRACT_VALID_CONTENT, CAUSAL_GOVERNANCE_INVALID_METADATA, CAUSAL_GOVERNANCE_MISSING_METADATA, CAUSAL_GOVERNANCE_VALID_METADATA, CLASSIFICATION_EFFICIENCY_VALID_METADATA, CLASSIFICATION_ONLY_FAST_PATH_METADATA, CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA, CORE_LOGIC_BRIEF_GENERIC_CONTENT, CORE_LOGIC_BRIEF_INCOMPLETE_CONTENT, CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT, CORE_LOGIC_BRIEF_VALID_CONTENT, DECISION_EXPERIMENT_GATE_INVALID_CONTENT, DECISION_EXPERIMENT_GATE_VALID_CONTENT, FIX_AGENT_ID, IMPLEMENTATION_AGENT_ID, LANE_BOUNDED_EXPERIMENT, LANE_CAUSAL_ESCALATION, LANE_DIAGNOSTIC_CLASSIFICATION, LANE_EXPERIMENT, LANE_LIGHTWEIGHT_MAINTENANCE, LANE_MECHANICAL_MAINTENANCE, LANE_READ_REVIEW_DOC_ONLY, LANE_RUNTIME_OWNER_BOUNDARY, LANE_SINGLE_FILE_RUNTIME, LANE_TEST_ONLY_PROOF, MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT, MODEL_FIT_MISSING_CONTENT, MODEL_FIT_VALID_SPARK_SAFE_CONTENT, REPRESENTATIVE_RESIDUAL_INVALID_METADATA, REPRESENTATIVE_RESIDUAL_MISSING_METADATA, REPRESENTATIVE_RESIDUAL_VALID_METADATA, RERUN_DECISION_VALID_METADATA, REVIEW_AGENT_ID, SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA, SCENARIO_CAUSAL_CLOSURE_MISSING_METADATA, SCENARIO_CAUSAL_CLOSURE_VALID_METADATA, SPRINT_STRATEGY_BRIEF_INCOMPLETE_CONTENT, SPRINT_STRATEGY_BRIEF_VALID_CONTENT, TEST_COMMIT_SHA, TEST_PUSH_TARGET, TEST_THEORY_LEDGER_REF, WORK_TRACKER_ACTIVE_DOCTOR_FILE, WORK_TRACKER_ACTIVE_STATUS, WORK_TRACKER_ATTEMPT_LEDGER_BAD_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_CLEAN_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_CODEX_NAMED_AGENT_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_GENERIC_IDENTITY_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_NOT_NEEDED_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_OPEN_PARTIAL_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_PARTIAL_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_SUPERSEDED_CONTENT, WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT, WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT, WORK_TRACKER_COMMIT_LEDGER_LEGACY_VALID_CONTENT, WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT, WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT, WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT, WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN, WORK_TRACKER_DOCTOR_CONTENT, WORK_TRACKER_DONE_STATUS, WORK_TRACKER_DONE_TEST_FILE, WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_FIVE_FIELD_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_OPEN_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_UNVALIDATED_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_NO_CHANGES_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_WITH_AGENT_CONTENT, WORK_TRACKER_FUTURE_DONE_STRICT_CONTENT, WORK_TRACKER_FUTURE_DONE_TEST_FILE, WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT, WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT, WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT, WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT, WORK_TRACKER_LEDGER_CLEAN_CONTENT, WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT, WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT, WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT, WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT, WORK_TRACKER_LEDGER_LOCAL_PATH_CONTENT, WORK_TRACKER_LEDGER_LOCAL_PATH_TEST_FILE, WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT, WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT, WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT, WORK_TRACKER_LEDGER_NUMBERED_PRE_IMPL_CONTENT, WORK_TRACKER_LEDGER_OPEN_CONTENT, WORK_TRACKER_LEDGER_PRE_IMPL_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_METADATA_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_RUNTIME_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_WRONG_AGENT_CONTENT, WORK_TRACKER_LEDGER_TEST_FILE, WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT, WORK_TRACKER_LEDGER_UNVALIDATED_IMPLEMENTATION_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_BAD_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_CLEAN_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_NOT_NEEDED_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_OPEN_CONTENT, assert, buildCurrentBlockerPayload, buildPackageDoctorLines, describe, findActivePackageLinkInSprint, isGeneratedCurrentBlockerPath, it, metadataHasClassificationOnlyOutcome, metadataRequiresSubagentSequencing, metadataUsesClassificationOnlyFastPath, metadataUsesPureClassificationFastPath, path, renderCurrentBlockerMarkdown, renderCurrentEdgeCardSection, resolveSprintPackageReference, upsertSprintCurrentEdgeCard, validateActiveWorkReferences, validateCausalDecisionContract, validateCausalGovernanceContract, validateClassificationEfficiencyContract, validateCommitAndPushLedger, validateContractProofRequirement, validateCoreLogicBrief, validateCurrentBlockerPayloadFreshness, validateCurrentBlockerSnapshot, validateDecisionExperimentGate, validateExecutionEvidenceLedger, validateExperimentOutcomeContract, validateFrontierOscillationContract, validateModelFitContract, validateObservablePredictionContract, validatePackageMetadataShape, validateProbePackageContract, validateRepresentativeResidualContract, validateRequiredPreImplProbeContract, validateRerunDecisionContract, validateSameFrontierStopContract, validateScenarioCausalClosureContract, validateScenarioFrontierOwnerBoundaryContract, validateSprintCurrentEdgeCard, validateSprintStrategyBrief, validateSubagentAttemptLedger, validateSubagentProgressLedger, validateSubagentSequencingLedger} from './work-tracker-subagent-ledger-fixtures.js';

describe('work tracker contract proof requirement validation', () => {
  it('allows active package in runtime-owner-boundary lane with correct contract transition naming and fixture/consumer proof', () => {
    const metadata = {
      status: WORK_TRACKER_ACTIVE_STATUS,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      proof: [
        'npm test -- test/rebalancer/operation-workflow-owner.test.js --fixture --consumer --contract-transition'
      ]
    };
    const errors = validateContractProofRequirement(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      { phase: 'pre-impl', status: WORK_TRACKER_ACTIVE_STATUS }
    );
    assert.deepEqual(errors, []);
  });

  it('allows active package in scenario-release-gate lane with correct contract transition naming', () => {
    const metadata = {
      status: WORK_TRACKER_ACTIVE_STATUS,
      lane: 'scenario-release-gate',
      proof: [
        'npm test -- test/rebalancer/operation-workflow-owner.test.js --transition'
      ]
    };
    const errors = validateContractProofRequirement(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      { phase: 'pre-impl', status: WORK_TRACKER_ACTIVE_STATUS }
    );
    assert.deepEqual(errors, []);
  });

  it('rejects active packages in runtime/scenario lanes if they do not name a contract transition under proof', () => {
    const metadata = {
      status: WORK_TRACKER_ACTIVE_STATUS,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      proof: [
        'npm test -- test/other/operation-workflow-owner.test.js --timeout=500 --count=2 --fixture --consumer'
      ]
    };
    const errors = validateContractProofRequirement(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      { phase: 'pre-impl', status: WORK_TRACKER_ACTIVE_STATUS }
    );
    assert.ok(errors.length > 0);
    assert.match(errors[0], /must name the contract transition under proof/u);
  });



  it('rejects owner-boundary packages lacking a focused contract fixture or affected consumer proof', () => {
    const metadata = {
      status: WORK_TRACKER_ACTIVE_STATUS,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      proof: [
        'npm test -- test/rebalancer/operation-workflow-owner.test.js --contract'
      ]
    };
    const errors = validateContractProofRequirement(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      { phase: 'pre-impl', status: WORK_TRACKER_ACTIVE_STATUS }
    );
    assert.ok(errors.length >= 2);
    assert.match(errors.join('\n'), /must include a focused contract fixture/u);
    assert.match(errors.join('\n'), /must include an affected consumer proof/u);
  });

  it('rejects scenario-driven owner-boundary packages lacking representative routing evidence', () => {
    const metadata = {
      status: WORK_TRACKER_ACTIVE_STATUS,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      scenario: 'rolling-restart',
      representativeResidual: {
        status: 'red',
        scenario: 'rolling-restart',
        artifact: 'test-output/reports/example.report.json',
        frontier: 'active_gate_snapshot_coverage',
        owner: 'diagnostics_owner',
        boundary: 'residual_inventory',
        dominantReason: 'residual_inventory_incomplete',
        nextAction: 'check the gate'
      },
      proof: [
        'npm test -- test/rebalancer/operation-workflow-owner.test.js --contract --fixture --consumer'
      ]
    };
    const errors = validateContractProofRequirement(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      { phase: 'pre-impl', status: WORK_TRACKER_ACTIVE_STATUS }
    );
    assert.ok(errors.length > 0);
    assert.match(errors[0], /must include representative routing evidence/u);
  });

  it('skips validation for non-active or non-pre-impl phases', () => {
    const metadata = {
      status: WORK_TRACKER_ACTIVE_STATUS,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      proof: []
    };
    const errors = validateContractProofRequirement(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      { phase: 'entry', status: WORK_TRACKER_ACTIVE_STATUS }
    );
    assert.deepEqual(errors, []);
  });
});

describe('work tracker stabilityCredit validation', () => {
  it('accepts optional theoryLedgerRefs as advisory ids', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_LIGHTWEIGHT_MAINTENANCE,
      scenario: 'none',
      owner: 'workflow_tooling_owner',
      boundary: 'experiment_theory_memory',
      nextAction: 'cite a theory ledger ref',
      stabilityCredit: 'instrumentation-only',
      whyHighestLeverageNow: 'This advances the sprint goal.',
      theoryLedgerRefs: [TEST_THEORY_LEDGER_REF],
    };
    const errors = validatePackageMetadataShape(
      'work/packages/done-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );

    assert.deepEqual(errors, []);
  });

  it('rejects malformed theoryLedgerRefs', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_LIGHTWEIGHT_MAINTENANCE,
      scenario: 'none',
      owner: 'workflow_tooling_owner',
      boundary: 'experiment_theory_memory',
      nextAction: 'reject malformed theory refs',
      stabilityCredit: 'instrumentation-only',
      whyHighestLeverageNow: 'This advances the sprint goal.',
      theoryLedgerRefs: ['not-a-theory-id'],
    };
    const errors = validatePackageMetadataShape(
      'work/packages/done-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );

    assert.match(errors.join('\n'), /theoryLedgerRefs/u);
  });

  it('accepts valid stabilityCredit values on new active packages', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_MECHANICAL_MAINTENANCE,
      scenario: 'none',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement stabilityCredit validation',
      stabilityCredit: 'local-proof-only',
      whyHighestLeverageNow: 'This advances the sprint goal.',
    };
    const errors = validatePackageMetadataShape(
      'work/packages/active-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );
    assert.deepEqual(errors, []);
  });

  it('rejects invalid stabilityCredit values', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_MECHANICAL_MAINTENANCE,
      scenario: 'none',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement stabilityCredit validation',
      stabilityCredit: 'not-a-valid-credit',
      whyHighestLeverageNow: 'This advances the sprint goal.',
    };
    const errors = validatePackageMetadataShape(
      'work/packages/active-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );
    assert.ok(errors.length > 0);
    assert.match(errors[0], /metadata stabilityCredit must be one of/u);
  });

  it('rejects missing stabilityCredit on new active packages', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_MECHANICAL_MAINTENANCE,
      scenario: 'none',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement stabilityCredit validation',
      whyHighestLeverageNow: 'This advances the sprint goal.',
    };
    const errors = validatePackageMetadataShape(
      'work/packages/active-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );
    assert.ok(errors.length > 0);
    assert.match(errors[0], /metadata stabilityCredit is required/u);
  });

  it('allows missing stabilityCredit on older active packages', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-18',
      lane: LANE_MECHANICAL_MAINTENANCE,
      scenario: 'none',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement stabilityCredit validation',
    };
    const errors = validatePackageMetadataShape(
      'work/packages/active-old-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );
    assert.deepEqual(errors, []);
  });

  it('rejects local-proof-only for runtime/scenario packages', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      scenario: 'rolling-restart',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement stabilityCredit validation',
      stabilityCredit: 'local-proof-only',
      whyHighestLeverageNow: 'This advances the sprint goal.',
    };
    const errors = validatePackageMetadataShape(
      'work/packages/active-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );
    assert.ok(errors.length > 0);
    assert.match(errors[0], /cannot hide behind local proof/u);
  });

  it('allows representative credits for runtime/scenario packages', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      scenario: 'rolling-restart',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement stabilityCredit validation',
      stabilityCredit: 'representative-green',
      whyHighestLeverageNow: 'This advances the sprint goal.',
    };
    const errors = validatePackageMetadataShape(
      'work/packages/active-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );
    assert.deepEqual(errors, []);
  });
});

describe('work tracker whyHighestLeverageNow validation', () => {
  it('accepts valid whyHighestLeverageNow values on new active packages', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      scenario: 'rolling-restart',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement leverage focus gate',
      stabilityCredit: 'representative-green',
      whyHighestLeverageNow: 'This advances the sprint goal of universal owner-contract completion.',
    };
    const errors = validatePackageMetadataShape(
      'work/packages/active-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );
    assert.deepEqual(errors, []);
  });

  it('rejects missing whyHighestLeverageNow on new packages', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      scenario: 'rolling-restart',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement leverage focus gate',
      stabilityCredit: 'representative-green',
    };
    const errors = validatePackageMetadataShape(
      'work/packages/active-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );
    assert.match(errors[0], /metadata whyHighestLeverageNow is required/u);
  });

  it('allows missing whyHighestLeverageNow on read-review-doc-only packages', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_READ_REVIEW_DOC_ONLY,
      scenario: 'none',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement leverage focus gate',
      stabilityCredit: 'local-proof-only',
    };
    const errors = validatePackageMetadataShape(
      'work/packages/active-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );
    assert.deepEqual(errors, []);
  });

  it('rejects whyHighestLeverageNow without required leverage terms', () => {
    const metadata = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_DONE_STATUS,
      opened: '2026-05-22',
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      scenario: 'rolling-restart',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement leverage focus gate',
      stabilityCredit: 'representative-green',
      whyHighestLeverageNow: 'Doing random unrelated cleanups.',
    };
    const errors = validatePackageMetadataShape(
      'work/packages/active-new-test.md',
      WORK_TRACKER_DONE_STATUS,
      metadata,
    );
    assert.match(errors[0], /metadata whyHighestLeverageNow must name the active sprint goal/u);
  });

  it('rejects placeholders on active packages but allows on todo/done packages', () => {
    const metadataActive = {
      schema: 'work-package-v1',
      status: WORK_TRACKER_ACTIVE_STATUS,
      opened: '2026-05-22',
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      scenario: 'rolling-restart',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      currentState: 'implementing leverage Focus Gate checks',
      nextAction: 'implement leverage focus gate',
      stabilityCredit: 'representative-green',
      whyHighestLeverageNow: '<placeholder>',
      proof: [],
      writeScope: [],
      handoffFiles: [],
      generatedFiles: [],
      candidateRuntimeFiles: [],
      commitScope: [],
      modelFit: {
        packageClass: 'bounded-implementation',
        intendedMinimumModel: 'gpt-5.3-codex-spark',
        scopeShape: 'leaf-slice',
        ambiguityScore: 1,
        escalationTriggers: [],
      },
    };
    const errorsActive = validatePackageMetadataShape(
      'work/packages/active-new-test.md',
      WORK_TRACKER_ACTIVE_STATUS,
      metadataActive,
    );
    assert.match(errorsActive[0], /metadata whyHighestLeverageNow must be a concrete value/u);

    const metadataTodo = {
      schema: 'work-package-v1',
      status: 'todo',
      opened: '2026-05-22',
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      scenario: 'rolling-restart',
      owner: 'rebalancer_owner',
      boundary: 'membership_lifecycle',
      nextAction: 'implement leverage focus gate',
      stabilityCredit: 'representative-green',
      whyHighestLeverageNow: '<placeholder>',
    };
    const errorsTodo = validatePackageMetadataShape(
      'work/packages/todo-new-test.md',
      'todo',
      metadataTodo,
    );
    assert.deepEqual(errorsTodo, []);
  });

  describe('work tracker representativeRerunCadence validation', () => {
    it('accepts valid representativeRerunCadence values on active runtime/scenario packages', () => {
      const metadata = {
        schema: 'work-package-v1',
        status: 'todo',
        opened: '2026-05-22',
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        scenario: 'rolling-restart',
        owner: 'rebalancer_owner',
        boundary: 'membership_lifecycle',
        nextAction: 'implement cadence validation',
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow: 'This advances the sprint goal.',
        representativeRerunCadence: 'fresh-representative-rerun',
        modelFit: {
          packageClass: 'bounded-implementation',
          intendedMinimumModel: 'gpt-5.3-codex-spark',
          scopeShape: 'leaf-slice',
          ambiguityScore: 1,
          escalationTriggers: [],
        },
      };
      const errors = validatePackageMetadataShape(
        'work/packages/todo-new-test.md',
        'todo',
        metadata,
      );
      assert.deepEqual(errors, []);
    });

    it('rejects invalid representativeRerunCadence values', () => {
      const metadata = {
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        opened: '2026-05-22',
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        scenario: 'rolling-restart',
        owner: 'rebalancer_owner',
        boundary: 'membership_lifecycle',
        nextAction: 'implement cadence validation',
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow: 'This advances the sprint goal.',
        representativeRerunCadence: 'invalid-cadence-value',
        modelFit: {
          packageClass: 'bounded-implementation',
          intendedMinimumModel: 'gpt-5.3-codex-spark',
          scopeShape: 'leaf-slice',
          ambiguityScore: 1,
          escalationTriggers: [],
        },
      };
      const errors = validatePackageMetadataShape(
        'work/packages/active-new-test.md',
        WORK_TRACKER_ACTIVE_STATUS,
        metadata,
      );
      assert.ok(errors.length > 0);
      assert.match(errors[0], /metadata representativeRerunCadence must be one of/u);
    });

    it('requires representativeRerunCadence for local-proof-only runtime/scenario packages', () => {
      const metadata = {
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        opened: '2026-05-22',
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        scenario: 'rolling-restart',
        owner: 'rebalancer_owner',
        boundary: 'membership_lifecycle',
        nextAction: 'implement cadence validation',
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow: 'This advances the sprint goal.',
        modelFit: {
          packageClass: 'bounded-implementation',
          intendedMinimumModel: 'gpt-5.3-codex-spark',
          scopeShape: 'leaf-slice',
          ambiguityScore: 1,
          escalationTriggers: [],
        },
      };
      const errors = validatePackageMetadataShape(
        'work/packages/active-new-test.md',
        WORK_TRACKER_ACTIVE_STATUS,
        metadata,
      );
      assert.ok(errors.length > 0);
      assert.match(errors[0], /must record representativeRerunCadence/u);
    });
  });

  describe('work tracker codeQualityAdmission validation', () => {
    it('requires codeQualityAdmission on new active maintenance/cleanup packages', () => {
      const metadata = {
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        opened: '2026-05-22',
        lane: LANE_MECHANICAL_MAINTENANCE,
        scenario: 'none',
        owner: 'workflow_tooling_owner',
        boundary: 'code_quality_focus_policy',
        currentState: 'implementing code quality admission validation',
        nextAction: 'enforce quality admission',
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow: 'This advances the universal owner contract sprint goal.',
        modelFit: {
          packageClass: 'mechanical-maintenance',
          intendedMinimumModel: 'gpt-5.3-codex-spark',
          scopeShape: 'leaf-slice',
          ambiguityScore: 1,
          escalationTriggers: [],
        },
      };
      const errors = validatePackageMetadataShape(
        'work/packages/active-new-test.md',
        WORK_TRACKER_ACTIVE_STATUS,
        metadata,
      );
      assert.ok(errors.length > 0);
      assert.match(errors[0], /must record codeQualityAdmission/u);
    });

    it('rejects invalid codeQualityAdmission structures and reasons', () => {
      const metadata = {
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        opened: '2026-05-22',
        lane: LANE_MECHANICAL_MAINTENANCE,
        scenario: 'none',
        owner: 'workflow_tooling_owner',
        boundary: 'code_quality_focus_policy',
        currentState: 'implementing code quality admission validation',
        nextAction: 'enforce quality admission',
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow: 'This advances the universal owner contract sprint goal.',
        codeQualityAdmission: {
          reason: 'invalid-reason-here',
          evidence: '',
        },
        modelFit: {
          packageClass: 'mechanical-maintenance',
          intendedMinimumModel: 'gpt-5.3-codex-spark',
          scopeShape: 'leaf-slice',
          ambiguityScore: 1,
          escalationTriggers: [],
        },
      };
      const errors = validatePackageMetadataShape(
        'work/packages/active-new-test.md',
        WORK_TRACKER_ACTIVE_STATUS,
        metadata,
      );
      assert.ok(errors.length >= 2);
      assert.match(errors[0], /metadata codeQualityAdmission.reason must be one of/u);
      assert.match(errors[1], /metadata codeQualityAdmission.evidence must be a non-empty string/u);
    });

    it('allows valid codeQualityAdmission structures', () => {
      const metadata = {
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        opened: '2026-05-22',
        lane: LANE_MECHANICAL_MAINTENANCE,
        scenario: 'none',
        owner: 'workflow_tooling_owner',
        boundary: 'code_quality_focus_policy',
        currentState: 'implementing code quality admission validation',
        nextAction: 'enforce quality admission',
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow: 'This advances the universal owner contract sprint goal.',
        codeQualityAdmission: {
          reason: 'removes-duplicate-decision-paths',
          evidence: 'This cleans up duplicate paths to improve active-gate snapshot convergence.',
        },
        modelFit: {
          packageClass: 'mechanical-maintenance',
          intendedMinimumModel: 'gpt-5.3-codex-spark',
          scopeShape: 'leaf-slice',
          ambiguityScore: 1,
          escalationTriggers: [],
        },
      };
      const errors = validatePackageMetadataShape(
        'work/packages/active-new-test.md',
        WORK_TRACKER_ACTIVE_STATUS,
        metadata,
      );
      assert.deepEqual(errors, []);
    });
  });
});
