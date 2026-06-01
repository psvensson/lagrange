import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArchitectureDecisionGatePayload,
  buildCurrentBlockerPayload,
  renderCurrentBlockerMarkdown,
  validateArchitectureDecisionGateContract,
} from '../../scripts/work-tracker.js';

const WORK_TRACKER_ACTIVE_STATUS = 'active';
const WORK_TRACKER_TEST_FILE =
  'work/packages/active-architecture-decision-gate-test.md';
const BASE_SCENARIO_METADATA = Object.freeze({
  status: WORK_TRACKER_ACTIVE_STATUS,
  lane: 'causal-escalation',
  scenario: 'rolling-restart',
  owner: 'operation_workflow_owner',
  boundary: 'workflow_progress',
  causalGovernance: Object.freeze({
    representativeOutcome: 'pending-before-rerun',
  }),
  scenarioCausalClosure: Object.freeze({
    referenceScenarioOrProbe: 'rolling-restart blocker probe',
    phaseChain: Object.freeze(['publication', 'workflow', 'active gate']),
    currentFirstFrontier:
      'operation_workflow_owner / workflow_progress retryable frontier',
    knownDownstreamBlockers: Object.freeze([
      'startup_active_gate_owner / snapshot_coverage',
    ]),
    missingCausalEdge:
      'dispatch-pending retry wake must be proven before downstream closure',
    missingCausalEdgeProbe:
      'npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js',
    boundedProgressProof:
      'Focused probe proves dispatch wake retry timeout advances.',
    boundedProgressProofArtifact:
      'test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js',
    expectedObservableTransition:
      'dispatch-pending workflow progress advances to retry-scheduled proof',
    maxProgressBound: 'one owner wake retry timeout dispatch cycle',
    sameFrontierFallback:
      'keep operation_workflow_owner / workflow_progress as the active frontier',
    expectedNextFrontier:
      'startup_active_gate_owner / snapshot_coverage',
    resultClassification: 'classification-only',
    stopCondition: 'classification-only-stop',
  }),
});
const ARCHITECTURE_DECISION_CHOICE = Object.freeze({
  id: 'open-architecture-package',
  summary: 'Open a bounded architecture package for the missing owner contract.',
  route: 'architecture-package',
  proof: Object.freeze([
    'npm run analyze:topology-convergence -- test-output/reports/example.report.json --explain active_gate_snapshot_coverage',
  ]),
});
const ARCHITECTURE_DECISION_GATE_EVIDENCE = Object.freeze([
  'scenario closure classified the selected owner contract as architecture-gap',
]);

describe('work tracker architecture decision gate validation', () => {
  it('requires an explicit gate when scenario evidence finds an architecture gap',
    () => {
      const metadata = {
        ...BASE_SCENARIO_METADATA,
        writeScope: ['src/example.js'],
        scenarioCausalClosure: {
          ...BASE_SCENARIO_METADATA.scenarioCausalClosure,
          resultClassification: 'architecture-gap',
          stopCondition: 'architecture-gap-stop',
        },
      };

      const errors = validateArchitectureDecisionGateContract(
        metadata,
        WORK_TRACKER_TEST_FILE,
        {
          phase: 'pre-impl',
          status: WORK_TRACKER_ACTIVE_STATUS,
        },
      ).join('\n');

      assert.match(errors, /architectureDecisionGate is required/u);
      assert.match(errors, /architecture-gap/u);
      assert.match(errors, /present concrete architecture choices/u);
    });

  it('blocks pre-implementation while the gate is required', () => {
    const metadata = {
      ...BASE_SCENARIO_METADATA,
      writeScope: ['src/example.js'],
      architectureDecisionGate: {
        status: 'required',
        trigger: 'architecture-gap',
        triggerEvidence: ARCHITECTURE_DECISION_GATE_EVIDENCE,
        choices: [],
        selectedChoice: null,
        nextAction: 'Select an architecture route before implementation.',
      },
    };

    const errors = validateArchitectureDecisionGateContract(
      metadata,
      WORK_TRACKER_TEST_FILE,
      {
        phase: 'pre-impl',
        status: WORK_TRACKER_ACTIVE_STATUS,
      },
    ).join('\n');

    assert.match(errors, /status is required/u);
    assert.match(errors, /present concrete architecture choices/u);
  });

  it('blocks runtime implementation after choices are presented until one is selected',
    () => {
      const metadata = {
        ...BASE_SCENARIO_METADATA,
        candidateRuntimeFiles: ['src/example.js'],
        architectureDecisionGate: {
          status: 'presented',
          trigger: 'architecture-gap',
          triggerEvidence: ARCHITECTURE_DECISION_GATE_EVIDENCE,
          choices: [ARCHITECTURE_DECISION_CHOICE],
          selectedChoice: null,
          nextAction: 'Wait for the selected architecture route.',
        },
      };

      const errors = validateArchitectureDecisionGateContract(
        metadata,
        WORK_TRACKER_TEST_FILE,
        {
          phase: 'pre-impl',
          status: WORK_TRACKER_ACTIVE_STATUS,
        },
      ).join('\n');

      assert.match(errors, /status is presented/u);
      assert.match(errors, /runtime implementation is blocked/u);
      assert.match(errors, /selected architecture route/u);
    });

  it('accepts a selected architecture route with concrete choice proof', () => {
    const metadata = {
      ...BASE_SCENARIO_METADATA,
      writeScope: ['src/example.js'],
      architectureDecisionGate: {
        status: 'selected',
        trigger: 'architecture-gap',
        triggerEvidence: ARCHITECTURE_DECISION_GATE_EVIDENCE,
        choices: [ARCHITECTURE_DECISION_CHOICE],
        selectedChoice: ARCHITECTURE_DECISION_CHOICE.id,
        nextAction: 'Open the selected architecture package.',
      },
    };

    const errors = validateArchitectureDecisionGateContract(
      metadata,
      WORK_TRACKER_TEST_FILE,
      {
        phase: 'pre-impl',
        status: WORK_TRACKER_ACTIVE_STATUS,
      },
    );

    assert.deepEqual(errors, []);
  });

  it('computes a watching gate when the frontier returns to a recent boundary',
    () => {
      const metadata = {
        ...BASE_SCENARIO_METADATA,
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

      const payload = buildArchitectureDecisionGatePayload(
        metadata,
        WORK_TRACKER_TEST_FILE,
        {packageHistoryEntries: history},
      );

      assert.equal(payload.status, 'watching');
      assert.equal(payload.trigger, 'frontier-oscillation');
      assert.match(
        payload.triggerEvidence.join('\n'),
        /frontier returned to a recently closed related boundary/u,
      );
    });

  it('auto-selects an architecture package route for architecture gaps',
    () => {
      const metadata = {
        ...BASE_SCENARIO_METADATA,
        scenarioCausalClosure: {
          ...BASE_SCENARIO_METADATA.scenarioCausalClosure,
          resultClassification: 'architecture-gap',
          stopCondition: 'architecture-gap-stop',
        },
      };

      const payload = buildArchitectureDecisionGatePayload(
        metadata,
        WORK_TRACKER_TEST_FILE,
        {packageHistoryEntries: []},
      );

      assert.equal(payload.status, 'selected');
      assert.equal(payload.selectedChoice, 'open-architecture-package');
      assert.ok(payload.choices.some((choice) =>
        choice.route === 'architecture-package'));
      assert.match(payload.nextAction, /autonomous architecture experiment/u);
    });

  it('derives selected gate next action from the selected route', () => {
    const payload = buildArchitectureDecisionGatePayload({
      ...BASE_SCENARIO_METADATA,
      architectureDecisionGate: {
        status: 'selected',
        trigger: 'frontier-oscillation',
        triggerEvidence: ['higher-model review selected local proof'],
        choices: [{
          id: 'continue-local-proof',
          summary: 'Proceed with local runtime proof.',
          route: 'continue-local-proof',
          proof: ['npm run work:evidence-summary -- report.json'],
        }],
        selectedChoice: 'continue-local-proof',
        nextAction:
          'Select an autonomous architecture experiment unless evidence is contradictory or blocked.',
      },
    }, WORK_TRACKER_TEST_FILE);

    assert.equal(payload.selectedChoice, 'continue-local-proof');
    assert.match(payload.nextAction, /selected local proof route/u);
    assert.doesNotMatch(payload.nextAction, /autonomous architecture experiment/u);
  });

  it('blocks runtime edits while oscillation is watching', () => {
    const metadata = {
      ...BASE_SCENARIO_METADATA,
      lane: 'runtime-owner-boundary',
      owner: 'operation_workflow_owner',
      boundary: 'workflow_progress',
      proof: [
        'npm test -- test/rebalancer/probe.test.js',
        'npm run work:evidence-summary -- report.json',
      ],
      writeScope: ['src/rebalancer/operation-workflow-owner.js'],
      architectureDecisionGate: {
        status: 'watching',
        trigger: 'frontier-oscillation',
        triggerEvidence: ['frontier returned twice'],
        choices: [],
        selectedChoice: null,
        nextAction: 'Open a probe first.',
      },
    };

    const errors = validateArchitectureDecisionGateContract(
      metadata,
      WORK_TRACKER_TEST_FILE,
      {
        phase: 'pre-impl',
        status: WORK_TRACKER_ACTIVE_STATUS,
      },
    ).join('\n');

    assert.match(errors, /watching frontier-oscillation/u);
    assert.match(errors, /autonomous experiment/u);
  });

  it('includes the gate in current-blocker payload and markdown', () => {
    const payload = buildCurrentBlockerPayload(
      'work/sprints/active-test.md',
      WORK_TRACKER_TEST_FILE,
      {
        ...BASE_SCENARIO_METADATA,
        schema: 'work-package-v1',
        artifact: 'test-output/reports/current.report.json',
        playback: 'none',
        dominantReason: 'architecture_choice_needed',
        currentState: 'Architecture decision gate is visible.',
        nextAction: 'Present choices.',
        proof: ['npm run work:evidence-summary -- test-output/reports/current.report.json'],
        writeScope: ['work/packages/active-architecture-decision-gate-test.md'],
        handoffFiles: [],
        generatedFiles: [],
        candidateRuntimeFiles: [],
        commitScope: [
          'work/packages/active-architecture-decision-gate-test.md',
        ],
        modelFit: {
          packageClass: 'architecture-gap-analysis',
          intendedMinimumModel: 'gpt-5.3-codex',
          scopeShape: 'scenario-causal-escalation',
          outputProfile: 'medium',
          escalationTriggers: ['architecture choice changes route'],
        },
      },
    );
    const rendered = renderCurrentBlockerMarkdown(payload);

    assert.equal(payload.architectureDecisionGate.status, 'not-required');
    assert.equal(payload.architectureDecisionGate.trigger, 'none');
    assert.match(rendered, /## Architecture Decision Gate/u);
    assert.match(rendered, /Status: `not-required`/u);
  });
});
