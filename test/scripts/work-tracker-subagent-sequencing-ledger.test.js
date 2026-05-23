import {CAUSAL_DECISION_CONTRACT_INVALID_CONTENT, CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA, CAUSAL_DECISION_CONTRACT_VALID_CONTENT, CAUSAL_GOVERNANCE_INVALID_METADATA, CAUSAL_GOVERNANCE_MISSING_METADATA, CAUSAL_GOVERNANCE_VALID_METADATA, CLASSIFICATION_EFFICIENCY_VALID_METADATA, CLASSIFICATION_ONLY_FAST_PATH_METADATA, CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA, CORE_LOGIC_BRIEF_GENERIC_CONTENT, CORE_LOGIC_BRIEF_INCOMPLETE_CONTENT, CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT, CORE_LOGIC_BRIEF_VALID_CONTENT, DECISION_EXPERIMENT_GATE_INVALID_CONTENT, DECISION_EXPERIMENT_GATE_VALID_CONTENT, FIX_AGENT_ID, IMPLEMENTATION_AGENT_ID, LANE_BOUNDED_EXPERIMENT, LANE_CAUSAL_ESCALATION, LANE_DIAGNOSTIC_CLASSIFICATION, LANE_EXPERIMENT, LANE_LIGHTWEIGHT_MAINTENANCE, LANE_MECHANICAL_MAINTENANCE, LANE_READ_REVIEW_DOC_ONLY, LANE_RUNTIME_OWNER_BOUNDARY, LANE_SINGLE_FILE_RUNTIME, LANE_TEST_ONLY_PROOF, MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT, MODEL_FIT_MISSING_CONTENT, MODEL_FIT_VALID_SPARK_SAFE_CONTENT, REPRESENTATIVE_RESIDUAL_INVALID_METADATA, REPRESENTATIVE_RESIDUAL_MISSING_METADATA, REPRESENTATIVE_RESIDUAL_VALID_METADATA, RERUN_DECISION_VALID_METADATA, REVIEW_AGENT_ID, SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA, SCENARIO_CAUSAL_CLOSURE_MISSING_METADATA, SCENARIO_CAUSAL_CLOSURE_VALID_METADATA, SPRINT_STRATEGY_BRIEF_INCOMPLETE_CONTENT, SPRINT_STRATEGY_BRIEF_VALID_CONTENT, TEST_COMMIT_SHA, TEST_PUSH_TARGET, TEST_THEORY_LEDGER_REF, WORK_TRACKER_ACTIVE_DOCTOR_FILE, WORK_TRACKER_ACTIVE_STATUS, WORK_TRACKER_ATTEMPT_LEDGER_BAD_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_CLEAN_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_CODEX_NAMED_AGENT_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_GENERIC_IDENTITY_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_NOT_NEEDED_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_OPEN_PARTIAL_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_PARTIAL_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_SUPERSEDED_CONTENT, WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT, WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT, WORK_TRACKER_COMMIT_LEDGER_LEGACY_VALID_CONTENT, WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT, WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT, WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT, WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN, WORK_TRACKER_DOCTOR_CONTENT, WORK_TRACKER_DONE_STATUS, WORK_TRACKER_DONE_TEST_FILE, WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_FIVE_FIELD_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_OPEN_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_UNVALIDATED_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_NO_CHANGES_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_WITH_AGENT_CONTENT, WORK_TRACKER_FUTURE_DONE_STRICT_CONTENT, WORK_TRACKER_FUTURE_DONE_TEST_FILE, WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT, WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT, WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT, WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT, WORK_TRACKER_LEDGER_CLEAN_CONTENT, WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT, WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT, WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT, WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT, WORK_TRACKER_LEDGER_LOCAL_PATH_CONTENT, WORK_TRACKER_LEDGER_LOCAL_PATH_TEST_FILE, WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT, WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT, WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT, WORK_TRACKER_LEDGER_NUMBERED_PRE_IMPL_CONTENT, WORK_TRACKER_LEDGER_OPEN_CONTENT, WORK_TRACKER_LEDGER_PRE_IMPL_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_METADATA_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_RUNTIME_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_WRONG_AGENT_CONTENT, WORK_TRACKER_LEDGER_TEST_FILE, WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT, WORK_TRACKER_LEDGER_UNVALIDATED_IMPLEMENTATION_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_BAD_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_CLEAN_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_NOT_NEEDED_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_OPEN_CONTENT, assert, buildCurrentBlockerPayload, buildPackageDoctorLines, describe, findActivePackageLinkInSprint, isGeneratedCurrentBlockerPath, it, metadataHasClassificationOnlyOutcome, metadataRequiresSubagentSequencing, metadataUsesClassificationOnlyFastPath, metadataUsesPureClassificationFastPath, path, renderCurrentBlockerMarkdown, renderCurrentEdgeCardSection, resolveSprintPackageReference, upsertSprintCurrentEdgeCard, validateActiveWorkReferences, validateCausalDecisionContract, validateCausalGovernanceContract, validateClassificationEfficiencyContract, validateCommitAndPushLedger, validateContractProofRequirement, validateCoreLogicBrief, validateCurrentBlockerPayloadFreshness, validateCurrentBlockerSnapshot, validateDecisionExperimentGate, validateExecutionEvidenceLedger, validateExperimentOutcomeContract, validateFrontierOscillationContract, validateModelFitContract, validateObservablePredictionContract, validatePackageMetadataShape, validateProbePackageContract, validateRepresentativeResidualContract, validateRequiredPreImplProbeContract, validateRerunDecisionContract, validateSameFrontierStopContract, validateScenarioCausalClosureContract, validateScenarioFrontierOwnerBoundaryContract, validateSprintCurrentEdgeCard, validateSprintStrategyBrief, validateSubagentAttemptLedger, validateSubagentProgressLedger, validateSubagentSequencingLedger} from './work-tracker-subagent-ledger-fixtures.js';

describe('work tracker subagent sequencing ledger validation', () => {
  it('requires subagent sequencing only for strict workflow lanes', () => {
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_READ_REVIEW_DOC_ONLY}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_MECHANICAL_MAINTENANCE}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_LIGHTWEIGHT_MAINTENANCE}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_TEST_ONLY_PROOF}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_DIAGNOSTIC_CLASSIFICATION}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_BOUNDED_EXPERIMENT}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_SINGLE_FILE_RUNTIME}),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing({lane: LANE_RUNTIME_OWNER_BOUNDARY}),
      true,
    );
    assert.equal(metadataRequiresSubagentSequencing({}), true);
  });

  it('uses classification-only fast path only without implementation writes', () => {
    assert.equal(
      metadataHasClassificationOnlyOutcome(CLASSIFICATION_ONLY_FAST_PATH_METADATA),
      true,
    );
    assert.equal(
      metadataUsesClassificationOnlyFastPath(
        CLASSIFICATION_ONLY_FAST_PATH_METADATA,
      ),
      true,
    );
    assert.equal(
      metadataUsesPureClassificationFastPath(
        CLASSIFICATION_ONLY_FAST_PATH_METADATA,
      ),
      true,
    );
    assert.equal(
      metadataRequiresSubagentSequencing(
        CLASSIFICATION_ONLY_FAST_PATH_METADATA,
      ),
      false,
    );
    assert.equal(
      metadataUsesClassificationOnlyFastPath(
        CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA,
      ),
      false,
    );
    assert.equal(
      metadataUsesPureClassificationFastPath(
        CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA,
      ),
      false,
    );
    assert.equal(
      metadataRequiresSubagentSequencing(
        CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA,
      ),
      true,
    );
  });

  it('reports active metadata-bearing packages without the new ledger', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /Subagent Sequencing Ledger is required/u);
  });

  it('accepts execution evidence without agent identity as closure proof', () => {
    const errors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('accepts compact five-field execution evidence as closure proof', () => {
    const errors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_FIVE_FIELD_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresVerificationFix: true},
    );

    assert.deepEqual(errors, []);
  });

  it('requires verifier-fixer evidence when closure verification is required', () => {
    const missingVerifierErrors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresVerificationFix: true},
    );
    const completeVerifierErrors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresVerificationFix: true},
    );
    const missingChangedFilesErrors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_NO_CHANGES_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresVerificationFix: true},
    );

    assert.match(
      missingVerifierErrors.join('\n'),
      /verification-fix item/u,
    );
    assert.deepEqual(completeVerifierErrors, []);
    assert.match(
      missingChangedFilesErrors.join('\n'),
      /changed files:/u,
    );
  });

  it('accepts execution evidence with real agent provenance', () => {
    const errors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_WITH_AGENT_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.deepEqual(errors, []);
  });

  it('requires parent revalidation before execution evidence closure', () => {
    const errors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_UNVALIDATED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.match(
      errors.join('\n'),
      /parent revalidated focused proof: yes/u,
    );
  });

  it('allows open execution evidence before closure', () => {
    const errors = validateExecutionEvidenceLedger(
      WORK_TRACKER_EXECUTION_EVIDENCE_OPEN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: false, allowOpenImplementation: true},
    );

    assert.deepEqual(errors, []);
  });

  it('allows done historical packages without the new ledger', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: false},
    );

    assert.deepEqual(errors, []);
  });

  it('requires a progress ledger when subagent sequencing is required', () => {
    const errors = validateSubagentProgressLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(
      errors[0],
      /Subagent Progress Ledger or Subagent Progress And Attempt Ledger is required/u,
    );
  });

  it('accepts checked subagent progress updates with evidence and next step', () => {
    const errors = validateSubagentProgressLedger(
      WORK_TRACKER_PROGRESS_LEDGER_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.deepEqual(errors, []);
  });

  it('accepts one combined progress and attempt checkpoint ledger', () => {
    const progressErrors = validateSubagentProgressLedger(
      WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );
    const attemptErrors = validateSubagentAttemptLedger(
      WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.deepEqual(progressErrors, []);
    assert.deepEqual(attemptErrors, []);
  });

  it('accepts local runtime wording in real-agent checkpoint evidence', () => {
    const progressErrors = validateSubagentProgressLedger(
      WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );
    const attemptErrors = validateSubagentAttemptLedger(
      WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.deepEqual(progressErrors, []);
    assert.deepEqual(attemptErrors, []);
  });

  it('requires completed progress updates before pre-implementation proof', () => {
    const errors = validateSubagentProgressLedger(
      WORK_TRACKER_PROGRESS_LEDGER_OPEN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /at least one completed subtask/u);
  });

  it('reports checked progress updates without durable evidence or next step', () => {
    const errors = validateSubagentProgressLedger(
      WORK_TRACKER_PROGRESS_LEDGER_BAD_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /non-real agent identity/u);
    assert.match(errors.join('\n'), /`evidence:`/u);
    assert.match(errors.join('\n'), /`next:` or `blocker:`/u);
  });

  it('rejects not-needed progress entries as strict subagent identity proof', () => {
    const errors = validateSubagentProgressLedger(
      WORK_TRACKER_PROGRESS_LEDGER_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /Agent <name> \(<agent-id>\)/u);
  });

  it('requires an attempt ledger when subagent sequencing is required', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true},
    );

    assert.equal(errors.length, 1);
    assert.match(
      errors[0],
      /Subagent Attempt Ledger or Subagent Progress And Attempt Ledger is required/u,
    );
  });

  it('accepts checked subagent attempt checkpoints with parent action', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.deepEqual(errors, []);
  });

  it('requires partial-unvalidated attempts to be superseded', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_PARTIAL_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /partial-unvalidated attempt must be followed/u);
  });

  it('accepts superseded recovery after a partial-unvalidated attempt', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_SUPERSEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.deepEqual(errors, []);
  });

  it('reports generic Codex role labels in attempt ledger identities', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_GENERIC_IDENTITY_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /non-real agent identity/u);
  });

  it('accepts real Codex-named agents when the identity has a concrete UUID',
    () => {
      const errors = validateSubagentAttemptLedger(
        WORK_TRACKER_ATTEMPT_LEDGER_CODEX_NAMED_AGENT_CONTENT,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {requiresLedger: true, requiresStrictEntries: true},
      );

      assert.deepEqual(errors, []);
    });

  it('reports checked attempt entries without checkpoint proof fields', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_BAD_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /status/u);
    assert.match(errors.join('\n'), /last checkpoint/u);
    assert.match(errors.join('\n'), /parent action/u);
    assert.match(errors.join('\n'), /`evidence:`/u);
    assert.match(errors.join('\n'), /`next:` or `blocker:`/u);
  });

  it('rejects open attempt items at closure validation', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_OPEN_PARTIAL_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /Subagent Attempt Ledger has open items/u);
  });

  it('rejects not-needed attempt entries as strict subagent identity proof', () => {
    const errors = validateSubagentAttemptLedger(
      WORK_TRACKER_ATTEMPT_LEDGER_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /Agent <name> \(<agent-id>\)/u);
  });

  it('reports open and unchecked required ledger items', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_OPEN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.equal(errors.length, 4);
    assert.match(errors[0], /has open items/u);
    assert.match(errors[1], /Review subagent recorded/u);
    assert.match(errors[2], /Fix subagent recorded or explicitly not needed/u);
    assert.match(errors[3], /Implementation subagent recorded/u);
  });

  it('allows pending subagent ledgers on queued packages', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_OPEN_CONTENT,
      'work/packages/todo-test-package.md',
      {
        allowPendingSubagentLedger: true,
        requiresLedger: false,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('accepts a clean review with an explicit not-needed fix entry', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CLEAN_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('rejects implementation completion before parent revalidation proof', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_UNVALIDATED_IMPLEMENTATION_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(
      errors.join('\n'),
      /parent revalidated focused proof: yes/u,
    );
  });

  it('accepts a fixes-required review with a separate real fix agent', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('accepts metadata-only fixes performed by the review agent', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_REVIEW_FIXED_METADATA_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('rejects review-fixed entries for non-metadata changes', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_REVIEW_FIXED_RUNTIME_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /metadata-only/u);
  });

  it('requires review-fixed metadata fixes to use the review agent', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_REVIEW_FIXED_WRONG_AGENT_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /must be recorded by the review agent/u);
  });

  it('allows pending implementation at pre-implementation validation', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_PRE_IMPL_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        requiresLedger: true,
        requiresStrictEntries: true,
        allowOpenImplementation: true,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('accepts numbered checklist ledger entries at pre-implementation validation',
    () => {
      const errors = validateSubagentSequencingLedger(
        WORK_TRACKER_LEDGER_NUMBERED_PRE_IMPL_CONTENT,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {
          requiresLedger: true,
          requiresStrictEntries: true,
          allowOpenImplementation: true,
        },
      );

      assert.deepEqual(errors, []);
    });

  it('allows unavailable subagent states before closure but not as closure proof', () => {
    const preImplErrors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        requiresLedger: true,
        requiresStrictEntries: true,
        allowOpenImplementation: true,
        allowUnavailableSubagents: true,
      },
    );
    const closureErrors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        requiresLedger: true,
        requiresStrictEntries: true,
      },
    );

    assert.deepEqual(preImplErrors, []);
    assert.match(closureErrors.join('\n'), /Subagent Sequencing Ledger/u);
  });

  it('accepts not-needed review for the first package in a sprint', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('reports ambiguous not-needed review without first-package reason', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /first-package-in-sprint/u);
  });

  it('reports checked ledger items without real agent id proof', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /review entry must match/u);
    assert.match(errors.join('\n'), /implementation entry must/u);
  });

  it('reports implementation entries using local session identities', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /non-real agent identity/u);
  });

  it('reports explicit non-real parent Codex notes in checked strict entries', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /non-real agent identity/u);
  });

  it('accepts real agent entries whose package path contains local', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LOCAL_PATH_CONTENT,
      WORK_TRACKER_LEDGER_LOCAL_PATH_TEST_FILE,
    );

    assert.deepEqual(errors, []);
  });

  it('reports not-needed fixes when review found fixes required', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /cannot be not-needed/u);
  });

  it('grandfathers historical done-package session labels when strict entries are not required', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT,
      WORK_TRACKER_DONE_TEST_FILE,
      {requiresLedger: false, requiresStrictEntries: false},
    );

    assert.deepEqual(errors, []);
  });

  it('reports historical session labels when strict entries are required', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, requiresStrictEntries: true},
    );

    assert.match(errors.join('\n'), /review entry must match/u);
    assert.match(errors.join('\n'), /implementation entry must/u);
  });

  it('reports checked ledger items that still contain pending markers', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /pending-before-implementation-resumes/u);
  });

  it('reports checked ledger items that still contain template placeholders', () => {
    const errors = validateSubagentSequencingLedger(
      WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT,
      WORK_TRACKER_LEDGER_TEST_FILE,
    );

    assert.match(errors.join('\n'), /template placeholder/u);
  });
});
