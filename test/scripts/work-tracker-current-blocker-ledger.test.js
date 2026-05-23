import {CAUSAL_DECISION_CONTRACT_INVALID_CONTENT, CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA, CAUSAL_DECISION_CONTRACT_VALID_CONTENT, CAUSAL_GOVERNANCE_INVALID_METADATA, CAUSAL_GOVERNANCE_MISSING_METADATA, CAUSAL_GOVERNANCE_VALID_METADATA, CLASSIFICATION_EFFICIENCY_VALID_METADATA, CLASSIFICATION_ONLY_FAST_PATH_METADATA, CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA, CORE_LOGIC_BRIEF_GENERIC_CONTENT, CORE_LOGIC_BRIEF_INCOMPLETE_CONTENT, CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT, CORE_LOGIC_BRIEF_VALID_CONTENT, DECISION_EXPERIMENT_GATE_INVALID_CONTENT, DECISION_EXPERIMENT_GATE_VALID_CONTENT, FIX_AGENT_ID, IMPLEMENTATION_AGENT_ID, LANE_BOUNDED_EXPERIMENT, LANE_CAUSAL_ESCALATION, LANE_DIAGNOSTIC_CLASSIFICATION, LANE_EXPERIMENT, LANE_LIGHTWEIGHT_MAINTENANCE, LANE_MECHANICAL_MAINTENANCE, LANE_READ_REVIEW_DOC_ONLY, LANE_RUNTIME_OWNER_BOUNDARY, LANE_SINGLE_FILE_RUNTIME, LANE_TEST_ONLY_PROOF, MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT, MODEL_FIT_MISSING_CONTENT, MODEL_FIT_VALID_SPARK_SAFE_CONTENT, REPRESENTATIVE_RESIDUAL_INVALID_METADATA, REPRESENTATIVE_RESIDUAL_MISSING_METADATA, REPRESENTATIVE_RESIDUAL_VALID_METADATA, RERUN_DECISION_VALID_METADATA, REVIEW_AGENT_ID, SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA, SCENARIO_CAUSAL_CLOSURE_MISSING_METADATA, SCENARIO_CAUSAL_CLOSURE_VALID_METADATA, SPRINT_STRATEGY_BRIEF_INCOMPLETE_CONTENT, SPRINT_STRATEGY_BRIEF_VALID_CONTENT, TEST_COMMIT_SHA, TEST_PUSH_TARGET, TEST_THEORY_LEDGER_REF, WORK_TRACKER_ACTIVE_DOCTOR_FILE, WORK_TRACKER_ACTIVE_STATUS, WORK_TRACKER_ATTEMPT_LEDGER_BAD_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_CLEAN_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_CODEX_NAMED_AGENT_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_GENERIC_IDENTITY_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_NOT_NEEDED_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_OPEN_PARTIAL_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_PARTIAL_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_SUPERSEDED_CONTENT, WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT, WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT, WORK_TRACKER_COMMIT_LEDGER_LEGACY_VALID_CONTENT, WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT, WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT, WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT, WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN, WORK_TRACKER_DOCTOR_CONTENT, WORK_TRACKER_DONE_STATUS, WORK_TRACKER_DONE_TEST_FILE, WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_FIVE_FIELD_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_OPEN_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_UNVALIDATED_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_NO_CHANGES_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_WITH_AGENT_CONTENT, WORK_TRACKER_FUTURE_DONE_STRICT_CONTENT, WORK_TRACKER_FUTURE_DONE_TEST_FILE, WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT, WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT, WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT, WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT, WORK_TRACKER_LEDGER_CLEAN_CONTENT, WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT, WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT, WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT, WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT, WORK_TRACKER_LEDGER_LOCAL_PATH_CONTENT, WORK_TRACKER_LEDGER_LOCAL_PATH_TEST_FILE, WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT, WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT, WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT, WORK_TRACKER_LEDGER_NUMBERED_PRE_IMPL_CONTENT, WORK_TRACKER_LEDGER_OPEN_CONTENT, WORK_TRACKER_LEDGER_PRE_IMPL_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_METADATA_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_RUNTIME_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_WRONG_AGENT_CONTENT, WORK_TRACKER_LEDGER_TEST_FILE, WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT, WORK_TRACKER_LEDGER_UNVALIDATED_IMPLEMENTATION_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_BAD_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_CLEAN_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_NOT_NEEDED_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_OPEN_CONTENT, assert, buildCurrentBlockerPayload, buildPackageDoctorLines, describe, findActivePackageLinkInSprint, isGeneratedCurrentBlockerPath, it, metadataHasClassificationOnlyOutcome, metadataRequiresSubagentSequencing, metadataUsesClassificationOnlyFastPath, metadataUsesPureClassificationFastPath, path, renderCurrentBlockerMarkdown, renderCurrentEdgeCardSection, resolveSprintPackageReference, upsertSprintCurrentEdgeCard, validateActiveWorkReferences, validateCausalDecisionContract, validateCausalGovernanceContract, validateClassificationEfficiencyContract, validateCommitAndPushLedger, validateContractProofRequirement, validateCoreLogicBrief, validateCurrentBlockerPayloadFreshness, validateCurrentBlockerSnapshot, validateDecisionExperimentGate, validateExecutionEvidenceLedger, validateExperimentOutcomeContract, validateFrontierOscillationContract, validateModelFitContract, validateObservablePredictionContract, validatePackageMetadataShape, validateProbePackageContract, validateRepresentativeResidualContract, validateRequiredPreImplProbeContract, validateRerunDecisionContract, validateSameFrontierStopContract, validateScenarioCausalClosureContract, validateScenarioFrontierOwnerBoundaryContract, validateSprintCurrentEdgeCard, validateSprintStrategyBrief, validateSubagentAttemptLedger, validateSubagentProgressLedger, validateSubagentSequencingLedger} from './work-tracker-subagent-ledger-fixtures.js';

describe('work tracker scenario causal closure validation', () => {
  it('requires scenario causal closure on active scenario-driven packages', () => {
    const errors = validateScenarioCausalClosureContract(
      SCENARIO_CAUSAL_CLOSURE_MISSING_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.equal(errors.length, 1);
    assert.match(errors[0], /metadata scenarioCausalClosure is required/u);
  });

  it('accepts concrete scenario causal closure metadata', () => {
    const errors = validateScenarioCausalClosureContract(
      SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
    );

    assert.deepEqual(errors, []);
  });

  it('requires active scenario package owner-boundary to match the first frontier',
    () => {
      const matchingMetadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        owner: 'operation_workflow_owner',
        boundary: 'workflow_progress',
      };
      const driftedMetadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
      };

      assert.deepEqual(
        validateScenarioFrontierOwnerBoundaryContract(
          matchingMetadata,
          WORK_TRACKER_LEDGER_TEST_FILE,
          {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
        ),
        [],
      );
      assert.match(
        validateScenarioFrontierOwnerBoundaryContract(
          driftedMetadata,
          WORK_TRACKER_LEDGER_TEST_FILE,
          {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
        ).join('\n'),
        /owner\/boundary must appear/u,
      );
    });

  it('allows first-frontier owner drift only with explicit migration proof',
    () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
        ownerBoundaryMigrationProof: {
          fromOwner: 'operation_workflow_owner',
          fromBoundary: 'workflow_progress',
          toOwner: 'startup_active_gate_owner',
          toBoundary: 'snapshot_coverage',
          reason: 'focused evidence migrated the first frontier',
          evidence:
            'npm run analyze:topology-convergence -- report.json --explain edge',
        },
      };

      assert.deepEqual(
        validateScenarioFrontierOwnerBoundaryContract(
          metadata,
          WORK_TRACKER_LEDGER_TEST_FILE,
          {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
        ),
        [],
      );
    });

  it('requires causal escalation when a frontier returns to a recent boundary',
    () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
      };
      const history = [
        {
          filePath: 'work/packages/done-20260514-active-gate.md',
          metadata: {
            scenario: 'rolling-restart',
            owner: 'startup_active_gate_owner',
            boundary: 'snapshot_coverage',
            scenarioCausalClosure: {
              resultClassification: 'migrated',
            },
          },
        },
      ];

      const errors = validateFrontierOscillationContract(
        metadata,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {
          packageHistoryEntries: history,
          status: WORK_TRACKER_ACTIVE_STATUS,
        },
      );

      assert.match(errors.join('\n'), /frontier oscillation detected/u);
      assert.match(errors.join('\n'), /causal-escalation/u);
    });

  it('allows selected runtime successors after an oscillation gate', () => {
    const metadata = {
      ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
      lane: LANE_RUNTIME_OWNER_BOUNDARY,
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      writeScope: ['src/startup/active-gate-owner.js'],
      commitScope: ['src/startup/active-gate-owner.js'],
      architectureDecisionGate: {
        status: 'selected',
        trigger: 'frontier-oscillation',
        triggerEvidence: ['frontier returned after causal classifier'],
        choices: [
          {
            id: 'bounded-runtime-successor',
            summary: 'Run the selected bounded runtime successor.',
            route: 'continue-local-proof',
            proof: ['npm run work:scenario-route -- report.json'],
          },
        ],
        selectedChoice: 'bounded-runtime-successor',
        nextAction: 'Run the runtime successor.',
      },
    };
    const history = [
      {
        filePath: 'work/packages/done-20260514-active-gate.md',
        metadata: {
          scenario: 'rolling-restart',
          owner: 'startup_active_gate_owner',
          boundary: 'snapshot_coverage',
          scenarioCausalClosure: {
            resultClassification: 'migrated',
          },
        },
      },
    ];

    const errors = validateFrontierOscillationContract(
      metadata,
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        packageHistoryEntries: history,
        status: WORK_TRACKER_ACTIVE_STATUS,
      },
    );

    assert.deepEqual(errors, []);
  });

  describe('boundary family oscillation validation', () => {
    it('rejects repeated adjacent-boundary oscillation inside the same boundary family', () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        owner: 'rebalancer_owner',
        boundary: 'publication_convergence',
      };
      const history = [
        {
          filePath: 'work/packages/done-20260515-active-gate.md',
          metadata: {
            scenario: 'rolling-restart',
            owner: 'rebalancer_owner',
            boundary: 'active-gate snapshot coverage',
            scenarioCausalClosure: {
              resultClassification: 'migrated',
            },
          },
        },
        {
          filePath: 'work/packages/done-20260514-readiness.md',
          metadata: {
            scenario: 'rolling-restart',
            owner: 'rebalancer_owner',
            boundary: 'readiness support',
            scenarioCausalClosure: {
              resultClassification: 'migrated',
            },
          },
        },
      ];

      const errors = validateFrontierOscillationContract(
        metadata,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {
          packageHistoryEntries: history,
          status: WORK_TRACKER_ACTIVE_STATUS,
        },
      );

      assert.ok(errors.length > 0);
      assert.match(errors[0], /repeated adjacent-boundary oscillation within the same boundary family/u);
    });

    it('accepts boundary family packages when there are fewer than two previous family packages', () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        owner: 'rebalancer_owner',
        boundary: 'publication_convergence',
      };
      const history = [
        {
          filePath: 'work/packages/done-20260515-active-gate.md',
          metadata: {
            scenario: 'rolling-restart',
            owner: 'rebalancer_owner',
            boundary: 'active-gate snapshot coverage',
            scenarioCausalClosure: {
              resultClassification: 'migrated',
            },
          },
        },
      ];

      const errors = validateFrontierOscillationContract(
        metadata,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {
          packageHistoryEntries: history,
          status: WORK_TRACKER_ACTIVE_STATUS,
        },
      );

      assert.deepEqual(errors, []);
    });
  });

  it('accepts causal escalation when oscillation handoff fields are recorded',
    () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        lane: LANE_CAUSAL_ESCALATION,
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
        scenarioCausalClosure: {
          ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
          recentFrontierHistory: [
            'startup_active_gate_owner / snapshot_coverage migrated',
            'topology_publication_owner / publication_convergence migrated',
          ],
          oscillationCheck:
            'frontier returned to startup_active_gate_owner / snapshot_coverage',
          handoffInvariant:
            'publication owner outcome must be fresh before active-gate snapshot selection',
        },
      };
      const history = [
        {
          filePath: 'work/packages/done-20260514-active-gate.md',
          metadata: {
            scenario: 'rolling-restart',
            owner: 'startup_active_gate_owner',
            boundary: 'snapshot_coverage',
            scenarioCausalClosure: {
              resultClassification: 'migrated',
            },
          },
        },
      ];

      const errors = validateFrontierOscillationContract(
        metadata,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {
          packageHistoryEntries: history,
          status: WORK_TRACKER_ACTIVE_STATUS,
        },
      );

      assert.deepEqual(errors, []);
    });

  it('requires handoff fields on causal escalation oscillation packages',
    () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        lane: LANE_CAUSAL_ESCALATION,
        owner: 'startup_active_gate_owner',
        boundary: 'snapshot_coverage',
      };
      const history = [
        {
          filePath: 'work/packages/done-20260514-active-gate.md',
          metadata: {
            scenario: 'rolling-restart',
            owner: 'startup_active_gate_owner',
            boundary: 'snapshot_coverage',
            scenarioCausalClosure: {
              resultClassification: 'migrated',
            },
          },
        },
      ];

      const errors = validateFrontierOscillationContract(
        metadata,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {
          packageHistoryEntries: history,
          status: WORK_TRACKER_ACTIVE_STATUS,
        },
      );
      const rendered = errors.join('\n');

      assert.match(rendered, /recentFrontierHistory/u);
      assert.match(rendered, /oscillationCheck/u);
      assert.match(rendered, /handoffInvariant/u);
    });

  it('rejects placeholders, empty arrays, invalid classifications, and missing progress proof',
    () => {
      const errors = validateScenarioCausalClosureContract(
        SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA,
        WORK_TRACKER_LEDGER_TEST_FILE,
        {requiresLedger: true, status: WORK_TRACKER_ACTIVE_STATUS},
      );
      const rendered = errors.join('\n');

      assert.match(rendered, /referenceScenarioOrProbe/u);
      assert.match(rendered, /phaseChain must be a non-empty array/u);
      assert.match(rendered, /knownDownstreamBlockers\[0\]/u);
      assert.match(rendered, /currentFirstFrontier/u);
      assert.match(rendered, /missingCausalEdge/u);
      assert.match(rendered, /missingCausalEdgeProbe must name a focused command/u);
      assert.match(rendered, /expectedNextFrontier/u);
      assert.match(rendered, /boundedProgressProofArtifact/u);
      assert.match(rendered, /expectedObservableTransition/u);
      assert.match(rendered, /maxProgressBound/u);
      assert.match(rendered, /sameFrontierFallback/u);
      assert.match(rendered, /resultClassification must be one of/u);
      assert.match(rendered, /stopCondition must be one of/u);
      assert.match(rendered, /boundedProgressProof must mention/u);
    });

  it('includes scenario causal closure in current-blocker payload and markdown',
    () => {
      const metadata = {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        schema: 'work-package-v1',
        lane: LANE_RUNTIME_OWNER_BOUNDARY,
        owner: 'workflow_tooling_owner',
        boundary: 'scenario_causal_closure',
        nextAction: 'Keep causal closure visible in handoff.',
        theoryLedgerRefs: [TEST_THEORY_LEDGER_REF],
        writeScope: ['scripts/work-tracker.js'],
        handoffFiles: ['work/packages/done-test-package.md'],
        generatedFiles: ['work/sprints/current-blocker.md'],
        candidateRuntimeFiles: ['src/example.js'],
        commitScope: ['scripts/work-tracker.js', 'work/sprints/current-blocker.md'],
        modelFit: {
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'owner-boundary-contraction/current-frontier',
          outputProfile: 'medium',
          escalationTriggers: ['scope expands'],
        },
        representativeResidual: {
          status: 'red',
          scenario: 'rolling-restart',
          artifact: 'test-output/reports/current-red.report.json',
          frontier: 'active_gate_snapshot_coverage',
          owner: 'startup_active_gate_owner',
          boundary: 'snapshot_coverage',
          dominantReason: 'snapshot_coverage_incomplete',
          nextAction: 'keep representative residual visible',
        },
        classificationEfficiency: {
          defaultMode: 'inline-gate-default',
          separatePackageReason: 'tracker-truth-change',
          artifactBudget: 'one-artifact',
          proofCommandBudget: 'two-or-three-canonical-commands',
          commands: ['npm run work:scenario-route -- test-output/reports/current-red.report.json'],
          decisionRecord: 'current package edge card',
          successorAction: 'update-current-package',
          runtimePromotionRule: 'runtime-owner-boundary only after stable route',
        },
      };
      const payload = buildCurrentBlockerPayload(
        'work/sprints/active-test.md',
        WORK_TRACKER_LEDGER_TEST_FILE,
        metadata,
      );
      const rendered = renderCurrentBlockerMarkdown(payload);

      assert.equal(
        payload.scenarioCausalClosure.resultClassification,
        'classification-only',
      );
      assert.equal(payload.lane, LANE_RUNTIME_OWNER_BOUNDARY);
      assert.equal(payload.modelFit.outputProfile, 'medium');
      assert.deepEqual(payload.writeScope, ['scripts/work-tracker.js']);
      assert.deepEqual(payload.handoffFiles, ['work/packages/done-test-package.md']);
      assert.deepEqual(payload.generatedFiles, ['work/sprints/current-blocker.md']);
      assert.deepEqual(payload.candidateRuntimeFiles, ['src/example.js']);
      assert.deepEqual(payload.commitScope, [
        'scripts/work-tracker.js',
        'work/sprints/current-blocker.md',
      ]);
      assert.deepEqual(payload.theoryLedgerRefs, [TEST_THEORY_LEDGER_REF]);
      assert.equal(payload.representativeResidual.status, 'red');
      assert.equal(
        payload.classificationEfficiency.defaultMode,
        'inline-gate-default',
      );
      assert.equal(
        payload.representativeResidual.frontier,
        'active_gate_snapshot_coverage',
      );
      assert.match(rendered, /## Theory And Implementation Focus/u);
      assert.match(rendered, /Theory under test/u);
      assert.match(rendered, /Implementation slice/u);
      assert.match(rendered, /Implementation files/u);
      assert.match(rendered, /src\/example\.js/u);
      assert.match(rendered, /Falsifying probe/u);
      assert.match(rendered, /Workflow lane/u);
      assert.match(rendered, /Output profile/u);
      assert.match(rendered, /## Theory Ledger References/u);
      assert.match(rendered, new RegExp(TEST_THEORY_LEDGER_REF, 'u'));
      assert.match(rendered, /## Scope/u);
      assert.match(rendered, /Write scope/u);
      assert.match(rendered, /Commit scope/u);
      assert.match(rendered, /## Representative Residual/u);
      assert.match(rendered, /active_gate_snapshot_coverage/u);
      assert.match(rendered, /## Scenario Causal Closure/u);
      assert.match(rendered, /Reference scenario\/probe/u);
      assert.match(rendered, /startup_active_gate_owner snapshot coverage/u);
      assert.match(rendered, /Missing causal edge probe/u);
      assert.match(rendered, /Bounded progress proof artifact/u);
      assert.match(rendered, /Expected observable transition/u);
      assert.match(rendered, /Max progress bound/u);
      assert.match(rendered, /Same-frontier fallback/u);
      assert.match(rendered, /classification-only-stop/u);
      assert.match(rendered, /## Classification Efficiency/u);
      assert.match(rendered, /update-current-package/u);
    });

  it('renders and refreshes the active sprint current edge card', () => {
    const payload = buildCurrentBlockerPayload(
      'work/sprints/active-test.md',
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_CAUSAL_ESCALATION,
        artifact: 'test-output/reports/current.report.json',
        playback: 'none',
        owner: 'topology_publication_owner',
        boundary: 'publication_convergence',
        dominantReason: 'publication_pending',
        currentState: 'Current package state.',
        nextAction: 'Build focused proof.',
        proof: [
          'npm run work:evidence-summary -- test-output/reports/current.report.json',
        ],
        writeScope: ['work/packages/active-test-package.md'],
        handoffFiles: [],
        generatedFiles: ['work/sprints/current-blocker.json'],
        candidateRuntimeFiles: ['src/example.js'],
        commitScope: ['work/packages/active-test-package.md'],
        modelFit: {
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'scenario-causal-escalation',
          outputProfile: 'medium',
          escalationTriggers: ['scope expands'],
        },
        representativeResidual: {
          status: 'same-frontier',
          scenario: 'rolling-restart',
          artifact: 'test-output/reports/current.report.json',
          frontier: 'publication_ack_convergence',
          owner: 'topology_publication_owner',
          boundary: 'publication_convergence',
          dominantReason: 'publication_pending',
          nextAction: 'keep edge visible',
        },
      },
    );
    const staleSprint = [
      '# Sprint',
      '',
      '## Current Edge Card',
      '',
      '```text',
      'Representative artifact: test-output/reports/old.report.json',
      'Selected cause: missing_published_nodes_present',
      '```',
      '',
      '## Package Queue',
      '',
      '1. Keep this section.',
      '',
    ].join('\n');
    const refreshedSprint = upsertSprintCurrentEdgeCard(staleSprint, payload);

    assert.match(
      refreshedSprint,
      /Representative artifact: test-output\/reports\/current\.report\.json/u,
    );
    assert.match(refreshedSprint, /Selected cause: publication_pending/u);
    assert.match(
      refreshedSprint,
      /Active package: work\/packages\/active-test-package\.md/u,
    );
    assert.match(refreshedSprint, /## Package Queue/u);
    assert.doesNotMatch(refreshedSprint, /old\.report\.json/u);
    assert.doesNotMatch(refreshedSprint, /missing_published_nodes_present/u);
  });

  it('reports a stale active sprint current edge card', () => {
    const payload = buildCurrentBlockerPayload(
      'work/sprints/active-test.md',
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_CAUSAL_ESCALATION,
        artifact: 'test-output/reports/current.report.json',
        playback: 'none',
        owner: 'topology_publication_owner',
        boundary: 'publication_convergence',
        dominantReason: 'publication_pending',
        currentState: 'Current package state.',
        nextAction: 'Build focused proof.',
        proof: [
          'npm run work:evidence-summary -- test-output/reports/current.report.json',
        ],
        writeScope: ['work/packages/active-test-package.md'],
        handoffFiles: [],
        generatedFiles: ['work/sprints/current-blocker.json'],
        candidateRuntimeFiles: [],
        commitScope: ['work/packages/active-test-package.md'],
        modelFit: {
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'scenario-causal-escalation',
          outputProfile: 'medium',
          escalationTriggers: ['scope expands'],
        },
      },
    );
    const validCard = renderCurrentEdgeCardSection(payload);
    const staleCard = validCard
      .replace('test-output/reports/current.report.json', 'old.report.json')
      .replace('publication_pending', 'missing_published_nodes_present');
    const staleErrors = validateSprintCurrentEdgeCard(
      staleCard,
      'work/sprints/active-test.md',
      payload,
    ).join('\n');

    assert.deepEqual(
      validateSprintCurrentEdgeCard(
        validCard,
        'work/sprints/active-test.md',
        payload,
      ),
      [],
    );
    assert.match(staleErrors, /Current Edge Card is stale/u);
    assert.match(staleErrors, /artifact/u);
    assert.match(staleErrors, /dominant reason/u);
    assert.match(staleErrors, /npm run work:repair/u);
  });

  it('discovers the active package from the generated Current Edge Card', () => {
    const sprintContent = [
      '# Sprint',
      '',
      'The current active package is',
      '  [Old Gate](../packages/active-old-gate.md).',
      '',
      '## Current Edge Card',
      '',
      '```text',
      'Active package: work/packages/active-current-gate.md',
      'Active package owner: topology_publication_owner',
      '```',
      '',
    ].join('\n');

    assert.equal(
      findActivePackageLinkInSprint(sprintContent),
      'work/packages/active-current-gate.md',
    );
  });

  it('resolves sprint active package references from card and markdown paths',
    () => {
      assert.equal(
        path.relative(process.cwd(), resolveSprintPackageReference(
          'work/sprints/active-sprint.md',
          'work/packages/active-current-gate.md',
        )),
        'work/packages/active-current-gate.md',
      );
      assert.equal(
        path.relative(process.cwd(), resolveSprintPackageReference(
          'work/sprints/active-sprint.md',
          '../packages/active-current-gate.md',
        )),
        'work/packages/active-current-gate.md',
      );
    });
});

describe('work tracker current blocker snapshot validation', () => {
  it('accepts a current-blocker snapshot that matches the active package', () => {
    const errors = validateCurrentBlockerSnapshot(
      {
        schema: 'current-blocker-v1',
        sprint: 'work/sprints/active-test.md',
        package: WORK_TRACKER_LEDGER_TEST_FILE,
        status: WORK_TRACKER_ACTIVE_STATUS,
      },
      {
        activeSprintFile: 'work/sprints/active-test.md',
        activePackageFile: WORK_TRACKER_LEDGER_TEST_FILE,
        packageExists: true,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('accepts a current-blocker snapshot sourced from a track next package', () => {
    const errors = validateCurrentBlockerSnapshot(
      {
        schema: 'current-blocker-v1',
        sprint: 'none',
        package: WORK_TRACKER_LEDGER_TEST_FILE,
        status: WORK_TRACKER_ACTIVE_STATUS,
      },
      {
        activeSprintFile: null,
        activePackageFile: WORK_TRACKER_LEDGER_TEST_FILE,
        packageExists: true,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('reports stale current-blocker field values with the repair command', () => {
    const expectedPayload = buildCurrentBlockerPayload(
      'work/sprints/active-test.md',
      WORK_TRACKER_LEDGER_TEST_FILE,
      {
        ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA,
        schema: 'work-package-v1',
        status: WORK_TRACKER_ACTIVE_STATUS,
        lane: LANE_CAUSAL_ESCALATION,
        artifact: 'test-output/reports/current.report.json',
        playback: 'none',
        owner: 'topology_publication_owner',
        boundary: 'publication_convergence',
        dominantReason: 'publication_pending',
        currentState: 'Current package state.',
        nextAction: 'Build focused proof.',
        proof: ['npm run work:evidence-summary -- test-output/reports/current.report.json'],
        writeScope: ['work/packages/active-test-package.md'],
        handoffFiles: [],
        generatedFiles: ['work/sprints/current-blocker.json'],
        candidateRuntimeFiles: [],
        commitScope: ['work/packages/active-test-package.md'],
        modelFit: {
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'scenario-causal-escalation',
          outputProfile: 'medium',
          escalationTriggers: ['scope expands'],
        },
      },
    );
    const stalePayload = {
      ...expectedPayload,
      artifact: 'test-output/reports/stale.report.json',
      modelFit: {
        ...expectedPayload.modelFit,
        packageClass: 'unknown',
      },
    };
    const errors = validateCurrentBlockerPayloadFreshness(
      stalePayload,
      expectedPayload,
    ).join('\n');

    assert.match(errors, /current-blocker snapshot is stale/u);
    assert.match(errors, /artifact/u);
    assert.match(errors, /modelFit\.packageClass/u);
    assert.match(errors, /npm run work:repair/u);
  });

  it('reports stale current-blocker package paths with the repair command', () => {
    const errors = validateCurrentBlockerSnapshot(
      {
        schema: 'current-blocker-v1',
        sprint: 'work/sprints/active-test.md',
        package: WORK_TRACKER_DONE_TEST_FILE,
        status: WORK_TRACKER_DONE_STATUS,
      },
      {
        activeSprintFile: 'work/sprints/active-test.md',
        activePackageFile: WORK_TRACKER_LEDGER_TEST_FILE,
        packageExists: false,
      },
    ).join('\n');

    assert.match(errors, /does not exist/u);
    assert.match(errors, /must be an active-\*/u);
    assert.match(errors, /does not match discovered active package/u);
    assert.match(errors, /npm run work:repair/u);
  });

  it('reports stale active package and sprint references in track handoffs',
    () => {
      const trackContent = [
        '# Track',
        '',
        '- Active sprint: `work/sprints/active-missing-sprint.md`',
        '- Active package: `work/packages/active-missing-package.md`',
        '- Existing package: `work/packages/active-existing-package.md`',
      ].join('\n');
      const errors = validateActiveWorkReferences(
        trackContent,
        'work/tracks/topology-convergence.md',
        {
          existingPaths: [
            'work/packages/active-existing-package.md',
          ],
        },
      ).join('\n');

      assert.match(errors, /active-missing-sprint\.md/u);
      assert.match(errors, /active-missing-package\.md/u);
      assert.doesNotMatch(errors, /active-existing-package\.md/u);
      assert.match(errors, /update track handoffs/u);
    });

  it('resolves relative active package links from generated handoff markdown',
    () => {
      const handoffContent = [
        '# Current Blocker',
        '',
        'Current active package:',
        '[Package](../packages/active-current-package.md)',
      ].join('\n');
      const errors = validateActiveWorkReferences(
        handoffContent,
        WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN,
        {
          existingPaths: [
            'work/packages/active-current-package.md',
          ],
        },
      );

      assert.deepEqual(errors, []);
    });

  it('allows a failed current-blocker handoff when no active sprint is open',
    () => {
      const errors = validateCurrentBlockerSnapshot(
        {
          schema: 'current-blocker-v1',
          sprint: 'work/sprints/archived/done-test-failed.md',
          package: 'work/packages/todo-test-package.md',
          status: 'failed',
        },
        {
          allowClosed: true,
          packageExists: true,
        },
      );

      assert.deepEqual(errors, []);
    });
});

describe('work tracker active scenario metadata shape', () => {
  it('reports missing handoff metadata before current-blocker renders unknowns',
    () => {
      const content = [
        '# Active Scenario Package',
        '',
        '<!-- work-package',
        JSON.stringify({
          schema: 'work-package-v1',
          status: WORK_TRACKER_ACTIVE_STATUS,
          opened: '2026-05-15',
          lane: LANE_CAUSAL_ESCALATION,
          scenario: 'rolling-restart',
          owner: 'topology_publication_owner',
          boundary: 'publication_convergence',
          currentState: 'Package has enough prose to render.',
          nextAction: 'Repair metadata before generating handoff.',
          proof: [],
          writeScope: [],
          handoffFiles: [],
          generatedFiles: [],
          candidateRuntimeFiles: [],
          commitScope: [],
        }, null, 2),
        '-->',
        '',
      ].join('\n');
      const result = buildPackageDoctorLines(
        WORK_TRACKER_ACTIVE_DOCTOR_FILE,
        content,
      );
      const errors = result.errors.join('\n');

      assert.match(errors, /metadata artifact must be concrete/u);
      assert.match(errors, /metadata playback must be concrete/u);
      assert.match(errors, /metadata dominantReason must be concrete/u);
      assert.match(errors, /metadata proof must not be empty/u);
      assert.match(errors, /metadata modelFit must be an object/u);
    });
});
