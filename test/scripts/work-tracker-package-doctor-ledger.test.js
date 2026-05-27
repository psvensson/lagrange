import fsSync from 'node:fs';
import {CAUSAL_DECISION_CONTRACT_INVALID_CONTENT, CAUSAL_DECISION_CONTRACT_OSCILLATION_METADATA, CAUSAL_DECISION_CONTRACT_VALID_CONTENT, CAUSAL_GOVERNANCE_INVALID_METADATA, CAUSAL_GOVERNANCE_MISSING_METADATA, CAUSAL_GOVERNANCE_VALID_METADATA, CLASSIFICATION_EFFICIENCY_VALID_METADATA, CLASSIFICATION_ONLY_FAST_PATH_METADATA, CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA, CORE_LOGIC_BRIEF_GENERIC_CONTENT, CORE_LOGIC_BRIEF_INCOMPLETE_CONTENT, CORE_LOGIC_BRIEF_NOT_NEEDED_CONTENT, CORE_LOGIC_BRIEF_VALID_CONTENT, DECISION_EXPERIMENT_GATE_INVALID_CONTENT, DECISION_EXPERIMENT_GATE_VALID_CONTENT, FIX_AGENT_ID, IMPLEMENTATION_AGENT_ID, LANE_BOUNDED_EXPERIMENT, LANE_CAUSAL_ESCALATION, LANE_DIAGNOSTIC_CLASSIFICATION, LANE_EXPERIMENT, LANE_LIGHTWEIGHT_MAINTENANCE, LANE_MECHANICAL_MAINTENANCE, LANE_READ_REVIEW_DOC_ONLY, LANE_RUNTIME_OWNER_BOUNDARY, LANE_SINGLE_FILE_RUNTIME, LANE_TEST_ONLY_PROOF, MODEL_FIT_INCOMPLETE_SPARK_SAFE_CONTENT, MODEL_FIT_MISSING_CONTENT, MODEL_FIT_VALID_SPARK_SAFE_CONTENT, REPRESENTATIVE_RESIDUAL_INVALID_METADATA, REPRESENTATIVE_RESIDUAL_MISSING_METADATA, REPRESENTATIVE_RESIDUAL_VALID_METADATA, RERUN_DECISION_VALID_METADATA, REVIEW_AGENT_ID, SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA, SCENARIO_CAUSAL_CLOSURE_MISSING_METADATA, SCENARIO_CAUSAL_CLOSURE_VALID_METADATA, SPRINT_STRATEGY_BRIEF_INCOMPLETE_CONTENT, SPRINT_STRATEGY_BRIEF_VALID_CONTENT, TEST_COMMIT_SHA, TEST_PUSH_TARGET, TEST_THEORY_LEDGER_REF, WORK_TRACKER_ACTIVE_DOCTOR_FILE, WORK_TRACKER_ACTIVE_STATUS, WORK_TRACKER_ATTEMPT_LEDGER_BAD_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_CLEAN_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_CODEX_NAMED_AGENT_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_GENERIC_IDENTITY_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_NOT_NEEDED_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_OPEN_PARTIAL_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_PARTIAL_CONTENT, WORK_TRACKER_ATTEMPT_LEDGER_SUPERSEDED_CONTENT, WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_CONTENT, WORK_TRACKER_COMBINED_PROGRESS_ATTEMPT_LEDGER_LOCAL_RUNTIME_CONTENT, WORK_TRACKER_COMMIT_LEDGER_LEGACY_VALID_CONTENT, WORK_TRACKER_COMMIT_LEDGER_PENDING_CONTENT, WORK_TRACKER_COMMIT_LEDGER_TEMPLATE_CONTENT, WORK_TRACKER_COMMIT_LEDGER_VALID_CONTENT, WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN, WORK_TRACKER_DOCTOR_CONTENT, WORK_TRACKER_DONE_STATUS, WORK_TRACKER_DONE_TEST_FILE, WORK_TRACKER_EXECUTION_EVIDENCE_CLEAN_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_FIVE_FIELD_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_OPEN_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_UNVALIDATED_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_NO_CHANGES_CONTENT, WORK_TRACKER_EXECUTION_EVIDENCE_WITH_AGENT_CONTENT, WORK_TRACKER_FUTURE_DONE_STRICT_CONTENT, WORK_TRACKER_FUTURE_DONE_TEST_FILE, WORK_TRACKER_LEDGER_AMBIGUOUS_REVIEW_NOT_NEEDED_CONTENT, WORK_TRACKER_LEDGER_BAD_NOT_NEEDED_CONTENT, WORK_TRACKER_LEDGER_CHECKED_PENDING_CONTENT, WORK_TRACKER_LEDGER_CHECKED_TEMPLATE_CONTENT, WORK_TRACKER_LEDGER_CLEAN_CONTENT, WORK_TRACKER_LEDGER_FIRST_PACKAGE_CONTENT, WORK_TRACKER_LEDGER_FIXES_REQUIRED_CONTENT, WORK_TRACKER_LEDGER_LEGACY_DONE_CONTENT, WORK_TRACKER_LEDGER_LOCAL_IMPLEMENTATION_CONTENT, WORK_TRACKER_LEDGER_LOCAL_PATH_CONTENT, WORK_TRACKER_LEDGER_LOCAL_PATH_TEST_FILE, WORK_TRACKER_LEDGER_MANUAL_FIX_NOTE_CONTENT, WORK_TRACKER_LEDGER_NO_AGENT_ID_CONTENT, WORK_TRACKER_LEDGER_NO_LEDGER_CONTENT, WORK_TRACKER_LEDGER_NUMBERED_PRE_IMPL_CONTENT, WORK_TRACKER_LEDGER_OPEN_CONTENT, WORK_TRACKER_LEDGER_PRE_IMPL_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_METADATA_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_RUNTIME_CONTENT, WORK_TRACKER_LEDGER_REVIEW_FIXED_WRONG_AGENT_CONTENT, WORK_TRACKER_LEDGER_TEST_FILE, WORK_TRACKER_LEDGER_UNAVAILABLE_CONTENT, WORK_TRACKER_LEDGER_UNVALIDATED_IMPLEMENTATION_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_BAD_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_CLEAN_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_NOT_NEEDED_CONTENT, WORK_TRACKER_PROGRESS_LEDGER_OPEN_CONTENT, assert, buildCurrentBlockerPayload, buildPackageDoctorLines, buildWorkPackageV2Metadata, describe, findActivePackageLinkInSprint, isGeneratedCurrentBlockerPath, it, metadataHasClassificationOnlyOutcome, metadataRequiresSubagentSequencing, metadataUsesClassificationOnlyFastPath, metadataUsesPureClassificationFastPath, path, renderCurrentBlockerMarkdown, renderCurrentEdgeCardSection, resolveSprintPackageReference, upsertSprintCurrentEdgeCard, validateActiveWorkReferences, validateCausalDecisionContract, validateCausalGovernanceContract, validateClassificationEfficiencyContract, validateCommitAndPushLedger, validateContractProofRequirement, validateCoreLogicBrief, validateCurrentBlockerPayloadFreshness, validateCurrentBlockerSnapshot, validateDecisionExperimentGate, validateExecutionEvidenceLedger, validateExperimentOutcomeContract, validateFrontierOscillationContract, validateModelFitContract, validateObservablePredictionContract, validatePackageMetadataShape, validateProbePackageContract, validateRepresentativeResidualContract, validateRequiredPreImplProbeContract, validateRerunDecisionContract, validateSameFrontierStopContract, validateScenarioCausalClosureContract, validateScenarioFrontierOwnerBoundaryContract, validateSprintCurrentEdgeCard, validateSprintStrategyBrief, validateSubagentAttemptLedger, validateSubagentProgressLedger, validateSubagentSequencingLedger} from './work-tracker-subagent-ledger-fixtures.js';

describe('work tracker package doctor', () => {
  it('recognizes generated current-blocker handoff files as tracker output', () => {
    assert.equal(
      isGeneratedCurrentBlockerPath(WORK_TRACKER_CURRENT_BLOCKER_MARKDOWN),
      true,
    );
  });

  it('prints a compact validation summary for a package', () => {
    const content = WORK_TRACKER_DOCTOR_CONTENT.replace(
      '"proof": [',
      `"theoryLedgerRefs": ["${TEST_THEORY_LEDGER_REF}"],\n  "proof": [`,
    );
    const report = buildPackageDoctorLines(WORK_TRACKER_ACTIVE_DOCTOR_FILE, content);
    const rendered = report.lines.join('\n');

    assert.deepEqual(report.errors, []);
    assert.match(rendered, /# Work Package Doctor/u);
    assert.match(rendered, /Owner: workflow_tooling_owner/u);
    assert.match(rendered, /Output profile: medium/u);
    assert.match(rendered, /Write scope: 1/u);
    assert.match(rendered, /Theory ledger refs: 1/u);
    assert.match(rendered, /Legacy touched files: 0/u);
    assert.match(rendered, /Validation: ok/u);
  });

  it('validates cited theory ledger refs against loaded ledger entries', () => {
    const content = WORK_TRACKER_DOCTOR_CONTENT.replace(
      '"proof": [',
      '"theoryLedgerRefs": ["theory-20260522-missing"],\n  "proof": [',
    );
    const report = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      content,
      {theoryLedgerContext: {entries: [], errors: []}},
    );

    assert.match(
      report.errors.join('\n'),
      /theory-20260522-missing, but it is not present/u,
    );
  });

  it('surfaces related theory candidates as advisory doctor guidance', () => {
    const report = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      WORK_TRACKER_DOCTOR_CONTENT,
      {
        theoryLedgerContext: {
          entries: [{
            id: 'theory-20260522-package-doctor-repeat',
            line: 12,
            fields: {
              Status: 'falsified',
              'Scenario/gate': 'none / workflow_tooling',
              'Owner/boundary': 'workflow_tooling_owner / package_doctor',
              'Next implication': 'do not repeat broad doctor prose.',
            },
          }],
          errors: [],
        },
      },
    );
    const rendered = report.lines.join('\n');

    assert.match(rendered, /Related theory ledger candidates exist/u);
    assert.match(rendered, /theory-20260522-package-doctor-repeat/u);
    assert.match(rendered, /falsified/u);
  });

  it('Gate 1: requires pre-implementation related-theory acknowledgment or explicit reason', () => {
    // Keep lightweight-maintenance lane, but set packageClass to workflow-tooling so it's high-risk for theories
    const content = WORK_TRACKER_DOCTOR_CONTENT.replace(
      '"packageClass": "bounded-implementation"',
      '"packageClass": "workflow-tooling"'
    );
    const report = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      content,
      {
        phase: 'pre-impl',
        theoryLedgerContext: {
          entries: [{
            id: 'theory-20260522-pkg-doctor-related',
            line: 1,
            fields: {
              Status: 'active',
              'Scenario/gate': 'none / workflow_tooling',
              'Owner/boundary': 'workflow_tooling_owner / package_doctor',
            }
          }],
          errors: [],
        }
      }
    );

    assert.match(
      report.errors.join('\n'),
      /high-risk package must acknowledge related theories/u
    );

    // If reason is present, it should pass
    const contentWithReason = content + '\nThis package is not-applicable for old theories.';
    const reportWithReason = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      contentWithReason,
      {
        phase: 'pre-impl',
        theoryLedgerContext: {
          entries: [{
            id: 'theory-20260522-pkg-doctor-related',
            line: 1,
            fields: {
              Status: 'active',
              'Scenario/gate': 'none / workflow_tooling',
              'Owner/boundary': 'workflow_tooling_owner / package_doctor',
            }
          }],
          errors: [],
        }
      }
    );
    assert.deepEqual(reportWithReason.errors, []);
  });

  it('Gate 2: requires justification explanation when citing/matching non-active theories', () => {
    // Cites or matches non-active theory, but doesn't have justification keywords
    const content = WORK_TRACKER_DOCTOR_CONTENT + '\nCiting theory-20260522-stale-theory.';
    const report = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      content,
      {
        phase: 'pre-impl',
        theoryLedgerContext: {
          entries: [{
            id: 'theory-20260522-stale-theory',
            line: 1,
            fields: {
              Status: 'stale',
              'Scenario/gate': 'none / workflow_tooling',
              'Owner/boundary': 'workflow_tooling_owner / package_doctor',
            }
          }],
          errors: [],
        }
      }
    );

    assert.match(
      report.errors.join('\n'),
      /does not provide a justification explanation/u
    );

    // With a justification keyword (e.g. "instead"), it should pass
    const contentWithJustification = content + '\nWe use this instead.';
    const reportWithJustification = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      contentWithJustification,
      {
        phase: 'pre-impl',
        theoryLedgerContext: {
          entries: [{
            id: 'theory-20260522-stale-theory',
            line: 1,
            fields: {
              Status: 'stale',
              'Scenario/gate': 'none / workflow_tooling',
              'Owner/boundary': 'workflow_tooling_owner / package_doctor',
            }
          }],
          errors: [],
        }
      }
    );
    assert.deepEqual(reportWithJustification.errors, []);
  });

  it('Gate 2: treats avoided theories as non-active routes', () => {
    const content = WORK_TRACKER_DOCTOR_CONTENT +
      '\nCiting theory-20260522-avoided-theory.';
    const report = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      content,
      {
        phase: 'pre-impl',
        theoryLedgerContext: {
          entries: [{
            id: 'theory-20260522-avoided-theory',
            line: 1,
            fields: {
              Status: 'avoided',
              'Scenario/gate': 'none / workflow_tooling',
              'Owner/boundary': 'workflow_tooling_owner / package_doctor',
            }
          }],
          errors: [],
        }
      }
    );

    assert.match(
      report.errors.join('\n'),
      /non-active theory theory-20260522-avoided-theory \[avoided\]/u,
    );
  });

  it('Gate 3: requires package linked in the ledger or explicit "no ledger update" at closure', () => {
    // Set status to todo and change write scope to README.md to avoid subagent ledger closure checks
    const content = WORK_TRACKER_DOCTOR_CONTENT.replace(
      '"status": "active"',
      '"status": "todo"'
    ).replaceAll(
      'scripts/work-tracker.js',
      'README.md'
    );
    const report = buildPackageDoctorLines(
      'work/packages/todo-20260507-doctor-test.md',
      content,
      {
        phase: 'closure',
        theoryLedgerContext: {
          entries: [],
          errors: [],
        }
      }
    );

    assert.match(
      report.errors.join('\n'),
      /closure requires either a theory ledger update linking to this package/u
    );

    // With explicit "no ledger update", it should pass
    const contentWithNoUpdate = content + '\nledger: not-needed';
    const reportWithNoUpdate = buildPackageDoctorLines(
      'work/packages/todo-20260507-doctor-test.md',
      contentWithNoUpdate,
      {
        phase: 'closure',
        theoryLedgerContext: {
          entries: [],
          errors: [],
        }
      }
    );
    assert.deepEqual(reportWithNoUpdate.errors, []);
  });

  it('requires executor and verifier-fixer proof for future closed runtime packages',
    () => {
      const report = buildPackageDoctorLines(
        WORK_TRACKER_FUTURE_DONE_TEST_FILE,
        WORK_TRACKER_FUTURE_DONE_STRICT_CONTENT,
        {phase: 'closure'},
      );
      const rendered = report.lines.join('\n');

      assert.match(rendered, /Execution Evidence is required/u);
      assert.match(rendered, /implementation and verification-fix/u);
    });

  it('prints acceleration guidance for admin-heavy packages', () => {
    const content = [
      '# Admin Package',
      '',
      '<!-- work-package',
      JSON.stringify(buildWorkPackageV2Metadata({
        status: WORK_TRACKER_ACTIVE_STATUS,
        opened: '2026-05-18',
        lane: LANE_READ_REVIEW_DOC_ONLY,
        scenario: 'none',
        artifact: 'none',
        playback: 'none',
        owner: 'release_gate_owner',
        boundary: 'representative_evidence',
        dominantReason: 'fresh_evidence_required',
        currentState: 'Metadata-only package needs a hard next action.',
        nextAction: 'Run representative evidence before more package edits.',
        proof: [
          'npm run work:evidence-summary -- test-output/reports/a.report.json',
          'npm run work:scenario-triage -- test-output/reports/a.report.json --markdown',
          'npm run analyze:topology-convergence -- test-output/reports/a.report.json',
          'npm run analyze:causal-model -- test-output/reports/a.report.json',
          'npm run analyze:priority-recovery-residuals -- test-output/reports/a.report.json --markdown',
          'npm run summarize:harness -- --report-dir test-output/reports',
        ],
        writeScope: ['work/packages/active-admin-package.md'],
        handoffFiles: [],
        generatedFiles: [],
        candidateRuntimeFiles: [],
        commitScope: ['work/packages/active-admin-package.md'],
        modelFit: {
          packageClass: 'bounded-implementation',
          intendedMinimumModel: 'gpt-5.3-codex-spark',
          scopeShape: 'leaf-slice',
          outputProfile: 'small',
          escalationTriggers: ['runtime ownership changes'],
          ambiguityScore: 1,
        },
      }), null, 2),
      '-->',
      '',
      '## Model Fit',
      '',
      '- Package class: `bounded-implementation`',
      '- Intended minimum model: `gpt-5.3-codex-spark`',
      '- Scope shape: `leaf-slice`',
      '- Output profile: `small`',
      '- Owned files: `work/packages/active-admin-package.md`',
      '- Forbidden files: `src/`',
      '- Frozen decisions: metadata-only package stops after one pass.',
      '- Escalation triggers: runtime ownership changes.',
      '- Focused proof: `npm run work:advance -- --check`',
      '',
    ].join('\n');
    const report = buildPackageDoctorLines(
      'work/packages/active-admin-package.md',
      content,
    );
    const rendered = report.lines.join('\n');

    assert.deepEqual(report.errors, []);
    assert.match(rendered, /## Process Guidance/u);
    assert.match(rendered, /Proof ladder is heavy/u);
    assert.match(rendered, /Admin stop applies/u);
  });

  it('allows classification-only fast path without subagent ledger', () => {
    const content = [
      '# Classification Only Package',
      '',
      '<!-- work-package',
      JSON.stringify(CLASSIFICATION_ONLY_FAST_PATH_METADATA, null, 2),
      '-->',
      '',
      CORE_LOGIC_BRIEF_VALID_CONTENT.split('\n').slice(2).join('\n'),
      CAUSAL_DECISION_CONTRACT_VALID_CONTENT.split('\n').slice(2).join('\n'),
      MODEL_FIT_VALID_SPARK_SAFE_CONTENT.split('\n').slice(2).join('\n'),
    ].join('\n');
    const report = buildPackageDoctorLines(
      WORK_TRACKER_LEDGER_TEST_FILE,
      content,
    );
    const rendered = report.lines.join('\n');

    assert.deepEqual(report.errors, []);
    assert.match(rendered, /Classification-only fast path: yes/u);
    assert.match(rendered, /Classification-only proof ladder is compact/u);
    assert.match(rendered, /subagent sequencing and static guardrails are not required/u);
  });

  it('keeps classification-only implementation scope on the normal lane', () => {
    const content = [
      '# Classification Only Package',
      '',
      '<!-- work-package',
      JSON.stringify(
        CLASSIFICATION_ONLY_WITH_IMPLEMENTATION_SCOPE_METADATA,
        null,
        2,
      ),
      '-->',
      '',
      CORE_LOGIC_BRIEF_VALID_CONTENT.split('\n').slice(2).join('\n'),
      MODEL_FIT_VALID_SPARK_SAFE_CONTENT.split('\n').slice(2).join('\n'),
    ].join('\n');
    const report = buildPackageDoctorLines(
      WORK_TRACKER_LEDGER_TEST_FILE,
      content,
    );
    const rendered = report.lines.join('\n');

    assert.doesNotMatch(
      report.errors.join('\n'),
      /Subagent Sequencing Ledger is required/u,
    );
    assert.match(
      report.errors.join('\n'),
      /classification-only result must not include runtime, test, script, or report paths/u,
    );
    assert.match(rendered, /Classification-only fast path: no/u);
    assert.match(rendered, /Classification-only result has implementation write scope/u);
  });

  it('rejects classification-efficiency implementation scope before promotion', () => {
    const implementationPaths = [
      'src/rebalancer/operation-workflow-owner.js',
      'test/rebalancer/operation-workflow-owner.test.js',
      'scripts/work-tracker.js',
      'test-output/reports/rolling-restart.report.json',
    ];
    for (const implementationPath of implementationPaths) {
      const metadata = buildWorkPackageV2Metadata({
        status: WORK_TRACKER_ACTIVE_STATUS,
        opened: '2026-05-27',
        lane: LANE_CAUSAL_ESCALATION,
        scenario: 'rolling-restart',
        artifact: 'test-output/reports/rerun.report.json',
        playback: 'none',
        owner: 'operation_workflow_owner',
        boundary: 'workflow_progress',
        dominantReason: 'priority_recovery_event_driven_wait',
        currentState: 'Classifier package has selected the same frontier.',
        nextAction: 'Open a successor before runtime scope is promoted.',
        writeScope: Object.freeze([implementationPath]),
        commitScope: Object.freeze([
          'work/packages/active-test-package.md',
          implementationPath,
        ]),
        modelFit: Object.freeze({
          packageClass: 'representative-frontier-closure',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'owner-boundary-contraction/current-frontier',
          outputProfile: 'medium',
          escalationTriggers: Object.freeze([
            'runtime ownership changes',
          ]),
          ambiguityScore: 1,
        }),
        classificationEfficiency:
          CLASSIFICATION_EFFICIENCY_VALID_METADATA.classificationEfficiency,
      });
      const content = [
        '# Classification Efficiency Package',
        '',
        '<!-- work-package',
        JSON.stringify(metadata, null, 2),
        '-->',
      ].join('\n');
      const report = buildPackageDoctorLines(
        WORK_TRACKER_LEDGER_TEST_FILE,
        content,
      );

      assert.match(
        report.errors.join('\n'),
        /pure classification package must not include runtime, test, script, or report paths/u,
        implementationPath,
      );
    }
  });

  it('requires verifier-fixer proof for optional code-scope lanes at closure', () => {
    const openLedgerContent = WORK_TRACKER_DOCTOR_CONTENT.replace(
      /## Subagent Sequencing Ledger[\s\S]*$/u,
      WORK_TRACKER_LEDGER_OPEN_CONTENT.split('\n').slice(2).join('\n'),
    );
    const entryReport = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      openLedgerContent,
      {phase: 'entry'},
    );
    const preImplReport = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      openLedgerContent,
      {phase: 'pre-impl'},
    );
    const closureReport = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      openLedgerContent,
      {phase: 'closure'},
    );

    assert.deepEqual(entryReport.errors, []);
    assert.deepEqual(preImplReport.errors, []);
    assert.match(
      closureReport.errors.join('\n'),
      /Execution Evidence is required with checked implementation and verification-fix/u,
    );
  });

  it('treats legacy subagent ledger sections as advisory once execution evidence exists',
    () => {
      const content = [
        WORK_TRACKER_DOCTOR_CONTENT,
        '',
        WORK_TRACKER_EXECUTION_EVIDENCE_VERIFIED_CONTENT
          .split('\n')
          .slice(2)
          .join('\n'),
        '',
        '## Subagent Progress Ledger',
        '',
        '- [ ] Agent Review (<agent-id>) old placeholder entry without closure proof.',
        '',
        '## Theory Ledger Update',
        '',
        'no ledger update',
        '',
      ].join('\n');
      const report = buildPackageDoctorLines(
        WORK_TRACKER_ACTIVE_DOCTOR_FILE,
        content,
        {phase: 'closure'},
      );
      const rendered = report.lines.join('\n');

      assert.deepEqual(report.errors, []);
      assert.match(rendered, /Legacy subagent ledger section detected/u);
      assert.match(rendered, /advisory, not closure gates/u);
    });

  it('surfaces scenario causal closure metadata in package doctor output', () => {
    const scenarioDoctorContent = WORK_TRACKER_DOCTOR_CONTENT.replace(
      '"scenario": "none"',
      '"scenario": "rolling-restart"',
    ).replace(
      '"owner": "workflow_tooling_owner"',
      '"owner": "operation_workflow_owner"',
    ).replace(
      '"boundary": "package_doctor"',
      '"boundary": "workflow_progress"',
    ).replace(
      '"modelFit": {',
      '"causalGovernance": ' +
        JSON.stringify(CAUSAL_GOVERNANCE_VALID_METADATA.causalGovernance) +
        ',\n    "scenarioCausalClosure": ' +
        JSON.stringify(
          {
            ...SCENARIO_CAUSAL_CLOSURE_VALID_METADATA.scenarioCausalClosure,
            resultClassification: 'pending-before-probe',
            stopCondition: 'continue-local-fix',
          },
        ) +
        ',\n    "modelFit": {',
    );
    const report = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      scenarioDoctorContent,
    );
    const rendered = report.lines.join('\n');

    assert.deepEqual(report.errors, []);
    assert.match(rendered, /Scenario causal closure: recorded/u);
  });

  it('prints concrete fix dry-run suggestions for schema failures', () => {
    const invalidDoctorContent = WORK_TRACKER_DOCTOR_CONTENT.replace(
      '"scenario": "none"',
      '"scenario": "rolling-restart"',
    ).replace(
      '"modelFit": {',
      '"causalGovernance": ' +
        JSON.stringify(CAUSAL_GOVERNANCE_INVALID_METADATA.causalGovernance) +
        ',\n    "scenarioCausalClosure": ' +
        JSON.stringify(
          SCENARIO_CAUSAL_CLOSURE_INVALID_METADATA.scenarioCausalClosure,
        ) +
        ',\n    "modelFit": {',
    );
    const report = buildPackageDoctorLines(
      WORK_TRACKER_ACTIVE_DOCTOR_FILE,
      invalidDoctorContent,
      {fixDryRun: true},
    );
    const rendered = report.lines.join('\n');

    assert.notDeepEqual(report.errors, []);
    assert.match(rendered, /## Fix Dry Run/u);
    assert.match(rendered, /work:package:schema/u);
    assert.match(rendered, /analyze:topology-convergence/u);
  });

  it('enforces discovery lane writeScope rules', () => {
    // Valid discovery package
    const validContent = WORK_TRACKER_DOCTOR_CONTENT.replace(
      '"lane": "lightweight-maintenance"',
      '"lane": "discovery"'
    ).replace(
      '"writeScope": [\n    "scripts/work-tracker.js"\n  ]',
      '"writeScope": [\n    "work/packages/active-20260525-discovery-lane-first-class.md"\n  ]'
    );
    const reportValid = buildPackageDoctorLines(
      'work/packages/active-20260525-discovery-lane-first-class.md',
      validContent
    );
    assert.deepEqual(reportValid.errors, []);

    // Invalid discovery package touching src/
    const invalidContent = WORK_TRACKER_DOCTOR_CONTENT.replace(
      '"lane": "lightweight-maintenance"',
      '"lane": "discovery"'
    );
    const reportInvalid = buildPackageDoctorLines(
      'work/packages/active-20260525-discovery-lane-first-class.md',
      invalidContent
    );
    assert.match(
      reportInvalid.errors.join('\n'),
      /discovery packages must restrict writeScope/u
    );
  });

  it('enforces discoveryRef rule for high-ambiguity runtime packages', () => {
    // Clean up or write fixture files synchronously in work/packages/
    const doneDiscoveryPath = 'work/packages/done-fixture-test-discovery.md';
    const activeDiscoveryPath = 'work/packages/active-fixture-test-discovery.md';
    const doneRuntimePath = 'work/packages/done-fixture-test-runtime.md';

    const discoveryMetadata = {
      schema: 'work-package-v2',
      status: 'done',
      intent: {
        opened: '2026-05-25',
        lane: 'discovery',
        scenario: 'none',
        owner: 'workflow_tooling_owner',
        boundary: 'package_doctor',
        currentState: 'done',
        nextAction: 'none'
      },
      scope: {
        writeScope: ['work/packages/done-fixture-test-discovery.md'],
        handoffFiles: [],
        generatedFiles: [],
        candidateRuntimeFiles: [],
        commitScope: ['work/packages/done-fixture-test-discovery.md']
      },
      gates: {
        whyHighestLeverageNow: 'essential',
        stabilityCredit: 'local-proof-only'
      },
      modelFit: {
        packageClass: 'discovery-framing',
        intendedMinimumModel: 'gpt-5.3-codex-spark',
        scopeShape: 'leaf-slice',
        outputProfile: 'medium'
      }
    };

    fsSync.writeFileSync(
      doneDiscoveryPath,
      `# Done Discovery\n\n<!-- work-package\n${JSON.stringify(discoveryMetadata, null, 2)}\n-->`
    );

    // High ambiguity runtime package metadata base
    const baseRuntimeMetadata = {
      schema: 'work-package-v2',
      status: 'active',
      intent: {
        opened: '2026-05-25',
        lane: 'runtime-owner-boundary',
        scenario: 'none',
        owner: 'workflow_tooling_owner',
        boundary: 'package_doctor',
        currentState: 'active',
        nextAction: 'implement'
      },
      scope: {
        writeScope: ['src/rebalancer/operation-workflow-owner.js'],
        handoffFiles: [],
        generatedFiles: [],
        candidateRuntimeFiles: [],
        commitScope: ['src/rebalancer/operation-workflow-owner.js']
      },
      gates: {
        whyHighestLeverageNow: 'essential',
        stabilityCredit: 'local-proof-only'
      },
      modelFit: {
        packageClass: 'runtime-owner-boundary',
        intendedMinimumModel: 'gpt-5.3-codex',
        scopeShape: 'owner-boundary-contraction',
        outputProfile: 'medium',
        ambiguityScore: 2
      }
    };

    const getPackageContent = (meta) => {
      return [
        '# High Ambiguity Runtime Package',
        '',
        '<!-- work-package',
        JSON.stringify(meta, null, 2),
        '-->',
        '',
        '## Model Fit',
        '',
        '- Package class: `runtime-owner-boundary`',
        '- Intended minimum model: `gpt-5.3-codex`',
        '- Scope shape: `owner-boundary-contraction`',
        '- Output profile: `medium`',
        '- Owned files: `src/rebalancer/operation-workflow-owner.js`',
        '- Forbidden files: `test/`',
        '- Frozen decisions: active package metadata requires the section.',
        '- Escalation triggers: owned files expand beyond tracker scripts.',
        '- Focused proof: `npm test`',
        '',
        '## Core Logic Brief',
        '',
        '- Canonical outcome: workflow reconciles retry.',
        '- Inputs/signals: rebalancer state.',
        '- State model or invariant: transition is atomic.',
        '- Non-goals and forbidden interpretations: no timeout relaxation.',
        '- Proof mapping: npm test proves it.',
        '- Wrong-slice trigger: none.',
        '',
        '## Causal Decision Contract',
        '',
        '| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |',
        '| --- | --- | --- | --- | --- | --- |',
        '| route owner | operation_workflow_owner | decidir | retry-scheduled | dispatch debt reduces | npm test |',
        '',
        '- Anti-symptom rationale: Direct fix.',
        '- Falsifying focused probe: npm test',
        '- Competing explanations: none.',
        '- Systemic interaction scan: check lifecycle.',
        '- Ping-pong stop rule: none.',
        '- Oscillation guard: none.',
        '',
        '## Decision Experiment Gate',
        '',
        '- Decision question: retry fact moves?',
        '- Architecture review: yes.',
        '- Competing hypotheses: none.',
        '- Pre-edit focused probe: npm test',
        '- Success metrics: count reduces.',
        '- Kill rule: stop if unchanged.',
        '- Representative rerun: npm test',
        '',
        '## Subagent Sequencing Ledger',
        '',
        '- [x] Review subagent recorded: `not-needed` (`first-package-in-sprint`).',
        '- [x] Fix subagent recorded or explicitly not needed: `not-needed`.',
        '- [x] Implementation subagent recorded:',
        `      Agent Implement (${IMPLEMENTATION_AGENT_ID}) implemented`,
        '      `work/packages/active-high-ambiguity.md`; parent revalidated focused proof: yes.',
        ''
      ].join('\n');
    };

    // Scenario 1: ambiguityScore >= 2 but no discoveryRef
    const report1 = buildPackageDoctorLines(
      'work/packages/active-high-ambiguity.md',
      getPackageContent(baseRuntimeMetadata),
      { phase: 'pre-impl' }
    );
    assert.match(
      report1.errors.join('\n'),
      /high-ambiguity runtime package.*must cite a discovery or experiment predecessor/u
    );

    // Scenario 2: cites non-existent file
    const metaWithMissingRef = {
      ...baseRuntimeMetadata,
      intent: {
        ...baseRuntimeMetadata.intent,
        discoveryRef: 'done-missing-file.md'
      }
    };
    const report2 = buildPackageDoctorLines(
      'work/packages/active-high-ambiguity.md',
      getPackageContent(metaWithMissingRef),
      { phase: 'pre-impl' }
    );
    assert.match(
      report2.errors.join('\n'),
      /refers to non-existent file/u
    );

    // Scenario 3: cites non-closed package (active)
    const activeDiscoveryMetadata = { ...discoveryMetadata, status: 'active' };
    fsSync.writeFileSync(
      activeDiscoveryPath,
      `# Active Discovery\n\n<!-- work-package\n${JSON.stringify(activeDiscoveryMetadata, null, 2)}\n-->`
    );
    const metaWithActiveRef = {
      ...baseRuntimeMetadata,
      intent: {
        ...baseRuntimeMetadata.intent,
        discoveryRef: 'active-fixture-test-discovery.md'
      }
    };
    const report3 = buildPackageDoctorLines(
      'work/packages/active-high-ambiguity.md',
      getPackageContent(metaWithActiveRef),
      { phase: 'pre-impl' }
    );
    assert.match(
      report3.errors.join('\n'),
      /must refer to a CLOSED \(done\) package/u
    );

    // Scenario 4: cites done package but with non-discovery/non-experiment lane (runtime)
    const doneRuntimeMetadata = { ...discoveryMetadata, lane: 'runtime-owner-boundary' };
    fsSync.writeFileSync(
      doneRuntimePath,
      `# Done Runtime\n\n<!-- work-package\n${JSON.stringify(doneRuntimeMetadata, null, 2)}\n-->`
    );
    const metaWithRuntimeRef = {
      ...baseRuntimeMetadata,
      intent: {
        ...baseRuntimeMetadata.intent,
        discoveryRef: 'done-fixture-test-runtime.md'
      }
    };
    const report4 = buildPackageDoctorLines(
      'work/packages/active-high-ambiguity.md',
      getPackageContent(metaWithRuntimeRef),
      { phase: 'pre-impl' }
    );
    assert.match(
      report4.errors.join('\n'),
      /must refer to a discovery or experiment package/u
    );

    // Scenario 5: cites valid done discovery package -> PASS
    const metaWithValidRef = {
      ...baseRuntimeMetadata,
      intent: {
        ...baseRuntimeMetadata.intent,
        discoveryRef: 'done-fixture-test-discovery.md'
      }
    };
    const report5 = buildPackageDoctorLines(
      'work/packages/active-high-ambiguity.md',
      getPackageContent(metaWithValidRef),
      { phase: 'pre-impl' }
    );
    const discoveryRefErrors = report5.errors.filter(err => err.includes('discoveryRef'));
    assert.deepEqual(discoveryRefErrors, []);

    // Clean up synchronous fixture files
    try {
      fsSync.unlinkSync(doneDiscoveryPath);
      fsSync.unlinkSync(activeDiscoveryPath);
      fsSync.unlinkSync(doneRuntimePath);
    } catch (e) {}
  });

  describe('Epic package kinds and leaf bypass validations', () => {
    const epicMeta = {
      schema: 'work-package-v2',
      status: 'active',
      intent: {
        opened: '2026-05-25',
        lane: 'lightweight-maintenance',
        scenario: 'none',
        artifact: 'none',
        playback: 'none',
        owner: 'workflow-steering',
        boundary: 'epic-validation',
        currentState: 'active',
        nextAction: 'test'
      },
      scope: {
        writeScope: ['work/packages/active-epic-test.md'],
        handoffFiles: [],
        generatedFiles: [],
        candidateRuntimeFiles: [],
        commitScope: ['work/packages/active-epic-test.md']
      },
      gates: {
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow: 'workflow-leverage-rebalance sprint goal leverage'
      },
      modelFit: {
        packageClass: 'bounded-implementation',
        intendedMinimumModel: 'gpt-5.3-codex-spark',
        scopeShape: 'leaf-slice',
        outputProfile: 'medium'
      }
    };

    it('flags missing required sections for epic packages', () => {
      const invalidEpicContent = `# Test Epic\n\n<!-- work-package\n${JSON.stringify(epicMeta, null, 2)}\n-->\n\n## Scope\nOnly invalid sections here.`;
      const report = buildPackageDoctorLines(
        'work/packages/active-epic-test.md',
        invalidEpicContent,
        { phase: 'pre-impl', kind: 'epic' }
      );
      const errorsStr = report.errors.join('\n');
      assert.match(errorsStr, /epic package must declare a ## Causal Question section/u);
      assert.match(errorsStr, /epic package must declare a ## Expected Leaf Set section/u);
      assert.match(errorsStr, /epic package must declare a ## Shared Discriminator section/u);
      assert.match(errorsStr, /epic package must declare a ## Stop Rule section/u);
    });

    it('passes active epic validation when required sections are present', () => {
      const validEpicContent = `# Test Epic\n\n<!-- work-package\n${JSON.stringify(epicMeta, null, 2)}\n-->\n\n## Causal Question\nQ\n\n## Expected Leaf Set\nL\n\n## Shared Discriminator\nD\n\n## Stop Rule\nS`;
      const report = buildPackageDoctorLines(
        'work/packages/active-epic-test.md',
        validEpicContent,
        { phase: 'pre-impl', kind: 'epic' }
      );
      assert.deepEqual(report.errors, []);
    });

    it('enforces retrospective fields at epic package closure', () => {
      const doneMeta = { ...epicMeta, status: 'done' };
      const validEpicWithoutRetro = `# Test Epic\n\n<!-- work-package\n${JSON.stringify(doneMeta, null, 2)}\n-->\n\n## Causal Question\nQ\n\n## Expected Leaf Set\nL\n\n## Shared Discriminator\nD\n\n## Stop Rule\nS`;
      const report = buildPackageDoctorLines(
        'work/packages/done-epic-test.md',
        validEpicWithoutRetro,
        { phase: 'closure', kind: 'epic' }
      );
      assert.match(report.errors.join('\n'), /epic package closure requires a ## Retrospective section/u);

      const invalidRetroContent = validEpicWithoutRetro + '\n\n## Retrospective\nWrong content.';
      const report2 = buildPackageDoctorLines(
        'work/packages/done-epic-test.md',
        invalidRetroContent,
        { phase: 'closure', kind: 'epic' }
      );
      const errors2 = report2.errors.join('\n');
      assert.match(errors2, /retrospective must answer 'What did we learn/u);
      assert.match(errors2, /retrospective must answer 'Did the discriminator hold/u);
      assert.match(errors2, /retrospective must answer 'Theory-ledger update/u);

      const validRetroContent = validEpicWithoutRetro + '\n\n## Retrospective\nWhat did we learn that we could not predict at lane-pick time? We learned a lot. Did the discriminator hold for every leaf? Yes it held. Theory-ledger update: yes.';
      const report3 = buildPackageDoctorLines(
        'work/packages/done-epic-test.md',
        validRetroContent,
        { phase: 'closure', kind: 'epic' }
      );
      assert.deepEqual(report3.errors, []);
    });

    it('leaf package with epicRef bypasses theory ledger ceremony', () => {
      const leafMeta = {
        schema: 'work-package-v2',
        status: 'active',
        intent: {
          opened: '2026-05-20',
          lane: 'mechanical-maintenance',
          scenario: 'none',
          artifact: 'none',
          playback: 'none',
          owner: 'workflow-steering',
          boundary: 'leaf-test',
          currentState: 'active',
          nextAction: 'test',
          epicRef: 'active-epic-test.md'
        },
        scope: {
          writeScope: ['work/packages/active-leaf-test.md'],
          handoffFiles: [],
          generatedFiles: [],
          candidateRuntimeFiles: [],
          commitScope: ['work/packages/active-leaf-test.md']
        },
        gates: {
          stabilityCredit: 'local-proof-only',
          whyHighestLeverageNow: 'workflow-leverage-rebalance sprint goal leverage'
        },
        modelFit: {
          packageClass: 'workflow-tooling',
          intendedMinimumModel: 'gpt-5.3-codex-medium',
          scopeShape: 'leaf-slice',
          outputProfile: 'medium',
          ambiguityScore: 1
        }
      };

      const leafContent = [
        '# Leaf Package',
        '',
        '<!-- work-package',
        JSON.stringify(leafMeta, null, 2),
        '-->',
        '',
        '## Model Fit',
        '',
        '- Package class: `workflow-tooling`',
        '- Intended minimum model: `gpt-5.3-codex-medium`',
        '- Scope shape: `leaf-slice`',
        '- Output profile: `medium`',
        '- Owned files: `work/packages/active-leaf-test.md`',
        '- Forbidden files: `src/`',
        '- Frozen decisions: none.',
        '- Escalation triggers: none.',
        '- Focused proof: none.',
        '',
      ].join('\n');

      const report = buildPackageDoctorLines(
        'work/packages/active-leaf-test.md',
        leafContent,
        { phase: 'pre-impl' }
      );
      // A high-risk workflow-tooling package with epicRef bypasses the theory ledger references requirement!
      assert.deepEqual(report.errors, []);
    });

    describe('Discriminator-based proof ladder tests', () => {
      it('valid role-tagged proof array in lightweight-maintenance lane passes validation', () => {
        const metadata = {
          schema: 'work-package-v2',
          status: 'active',
          intent: {
            opened: '2026-05-25',
            lane: 'lightweight-maintenance',
            scenario: 'none',
            artifact: 'none',
            playback: 'none',
            owner: 'workflow-steering',
            boundary: 'test',
            currentState: 'active',
            nextAction: 'test'
          },
          scope: {
            writeScope: ['work/packages/active-test.md'],
            handoffFiles: [],
            generatedFiles: [],
            candidateRuntimeFiles: [],
            commitScope: ['work/packages/active-test.md']
          },
          gates: {
            stabilityCredit: 'local-proof-only',
            whyHighestLeverageNow: 'sprint goal leverage proof'
          },
          modelFit: {
            packageClass: 'bounded-implementation',
            intendedMinimumModel: 'gpt-5.3-codex-spark',
            scopeShape: 'leaf-slice',
            outputProfile: 'medium',
            ambiguityScore: 1,
            escalationTriggers: ['escalate']
          },
          execution: {
            proof: [
              "regression: npm run regression-test"
            ]
          }
        };

        const content = [
          '# Test Package',
          '<!-- work-package',
          JSON.stringify(metadata, null, 2),
          '-->',
          '## Model Fit',
          '- Package class: `bounded-implementation`',
          '- Intended minimum model: `gpt-5.3-codex-spark`',
          '- Scope shape: `leaf-slice`',
          '- Output profile: `medium`',
          '- Owned files: `work/packages/active-test.md`',
          '- Forbidden files: `src/`',
          '- Frozen decisions: contract remains bounded.',
          '- Escalation triggers: escalate.',
          '- Focused proof: `npm run regression-test`',
          ''
        ].join('\n');

        const report = buildPackageDoctorLines('work/packages/active-test.md', content, { phase: 'pre-impl' });
        assert.deepEqual(report.errors, []);
      });

      it('missing regression role in lightweight-maintenance fails validation', () => {
        const metadata = {
          schema: 'work-package-v2',
          status: 'active',
          intent: {
            opened: '2026-05-25',
            lane: 'lightweight-maintenance',
            scenario: 'none',
            artifact: 'none',
            playback: 'none',
            owner: 'workflow-steering',
            boundary: 'test',
            currentState: 'active',
            nextAction: 'test'
          },
          scope: {
            writeScope: ['work/packages/active-test.md'],
            handoffFiles: [],
            generatedFiles: [],
            candidateRuntimeFiles: [],
            commitScope: ['work/packages/active-test.md']
          },
          gates: {
            stabilityCredit: 'local-proof-only',
            whyHighestLeverageNow: 'sprint goal leverage proof'
          },
          modelFit: {
            packageClass: 'bounded-implementation',
            intendedMinimumModel: 'gpt-5.3-codex-spark',
            scopeShape: 'leaf-slice',
            outputProfile: 'medium',
            ambiguityScore: 1,
            escalationTriggers: ['escalate']
          },
          execution: {
            proof: [
              "supporting: npm run lint"
            ]
          }
        };

        const content = [
          '# Test Package',
          '<!-- work-package',
          JSON.stringify(metadata, null, 2),
          '-->',
          '## Model Fit',
          '- Package class: `bounded-implementation`',
          '- Intended minimum model: `gpt-5.3-codex-spark`',
          '- Scope shape: `leaf-slice`',
          '- Output profile: `medium`',
          '- Owned files: `work/packages/active-test.md`',
          '- Forbidden files: `src/`',
          '- Frozen decisions: contract remains bounded.',
          '- Escalation triggers: escalate.',
          '- Focused proof: `npm run lint`',
          ''
        ].join('\n');

        const report = buildPackageDoctorLines('work/packages/active-test.md', content, { phase: 'pre-impl' });
        assert.match(report.errors.join('\n'), /must contain at least a 'regression' command/u);
      });
    });

    describe('Structured validator front-matter tests', () => {
      const getBaseMetadata = () => ({
        schema: 'work-package-v2',
        status: 'done',
        intent: {
          opened: '2026-05-25',
          lane: 'lightweight-maintenance',
          scenario: 'none',
          artifact: 'none',
          playback: 'none',
          owner: 'workflow-steering',
          boundary: 'test',
          currentState: 'active',
          nextAction: 'test'
        },
        scope: {
          writeScope: ['work/packages/done-test.md'],
          handoffFiles: [],
          generatedFiles: [],
          candidateRuntimeFiles: [],
          commitScope: ['work/packages/done-test.md']
        },
        gates: {
          stabilityCredit: 'local-proof-only',
          whyHighestLeverageNow: 'sprint goal leverage proof'
        },
        modelFit: {
          packageClass: 'bounded-implementation',
          intendedMinimumModel: 'gpt-5.3-codex-spark',
          scopeShape: 'leaf-slice',
          outputProfile: 'medium',
          ambiguityScore: 1,
          escalationTriggers: ['escalate']
        },
        execution: {
          proof: [
            "regression: npm run regression-test"
          ]
        }
      });

      const buildContent = (metadata) => [
        '# Test Package',
        '<!-- work-package',
        JSON.stringify(metadata, null, 2),
        '-->',
        '## Model Fit',
        '- Package class: `bounded-implementation`',
        '- Intended minimum model: `gpt-5.3-codex-spark`',
        '- Scope shape: `leaf-slice`',
        '- Output profile: `medium`',
        '- Owned files: `work/packages/done-test.md`',
        '- Forbidden files: `src/`',
        '- Frozen decisions: contract remains bounded.',
        '- Escalation triggers: escalate.',
        '- Focused proof: `npm run regression-test`',
        ''
      ].join('\n');

      it('valid structured execution front-matter at closure passes', () => {
        const metadata = getBaseMetadata();
        metadata.execution.implementation = {
          parentRevalidatedFocusedProof: true,
          filesChanged: ['work/packages/done-test.md']
        };
        metadata.execution.verificationFix = {
          parentRevalidatedFocusedProof: true
        };
        metadata.execution.theoryLedger = 'no-ledger-update';

        const content = buildContent(metadata);
        const report = buildPackageDoctorLines('work/packages/done-test.md', content, { phase: 'closure' });
        assert.deepEqual(report.errors, []);
      });

      it('structured execution missing implementation at closure fails', () => {
        const metadata = getBaseMetadata();
        metadata.execution.verificationFix = {
          parentRevalidatedFocusedProof: true
        };
        metadata.execution.theoryLedger = 'no-ledger-update';

        const content = buildContent(metadata);
        const report = buildPackageDoctorLines('work/packages/done-test.md', content, { phase: 'closure' });
        assert.match(report.errors.join('\n'), /execution.implementation front-matter object is required before closure/u);
      });

      it('structured execution with parentRevalidatedFocusedProof false fails', () => {
        const metadata = getBaseMetadata();
        metadata.execution.implementation = {
          parentRevalidatedFocusedProof: false,
          filesChanged: ['work/packages/done-test.md']
        };
        metadata.execution.verificationFix = {
          parentRevalidatedFocusedProof: true
        };
        metadata.execution.theoryLedger = 'no-ledger-update';

        const content = buildContent(metadata);
        const report = buildPackageDoctorLines('work/packages/done-test.md', content, { phase: 'closure' });
        assert.match(report.errors.join('\n'), /execution.implementation.parentRevalidatedFocusedProof must be true before closure/u);
      });
    });
  });
});
