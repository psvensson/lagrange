import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {buildPackageContent} from '../../scripts/work-package-new.js';
import {buildSprintAdvancePlan} from '../../scripts/work-sprint-advance.js';
import {
  parsePackageMetadata,
  renderCurrentEdgeCardSection,
  validateTheoryLoopPackageContract,
  validateTheoryLoopSprintClosure,
} from '../../scripts/work-tracker.js';

const TEMP_PREFIX = 'work-theory-loop-hardening-';
const ENCODING_UTF8 = 'utf8';

function theoryLoopMetadata(overrides = {}) {
  return {
    schema: 'work-package-v2',
    status: 'active',
    opened: '2026-05-28',
    lane: 'causal-escalation',
    scenario: 'rolling-restart',
    artifact: 'test-output/reports/rolling-restart.report.json',
    owner: 'startup_active_gate_owner',
    boundary: 'snapshot_coverage',
    dominantReason: 'active_gate_timed_out',
    currentState: 'Testing one promoted theory.',
    nextAction: 'Change source, run falsifier and regression, record result, and open successor.',
    proof: [
      'falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart.report.json',
      'regression: npm test -- test/distributed/harness/__tests__/rolling-restart.test.js',
    ],
    writeScope: ['src/control-plane/snapshot-service.js'],
    handoffFiles: [],
    generatedFiles: [],
    candidateRuntimeFiles: [],
    commitScope: ['src/control-plane/snapshot-service.js'],
    theoryLoop: {
      enforcement: 'source-code-package-required',
      promotedTheory: 'Snapshot service owns the missing coverage transition.',
      sprintGoalDelta: 'Coverage should move toward rolling-restart representative green.',
      sourceChangeRequired: true,
      successorRequired: true,
    },
    systemTheory: {
      problemStatement: 'Rolling restart remains at snapshot coverage.',
      phaseChain: ['route evidence selects coverage', 'source package tests the transition'],
      ownerBoundaryMap: ['startup_active_gate_owner / snapshot_coverage'],
      stableFacts: ['rolling restart is still red'],
      changedFacts: ['a promoted source theory was selected'],
      competingTheories: ['source contract missing', 'owner boundary must migrate'],
      eliminatedTheories: ['classification-only package is not a valid execution step'],
      downstreamSymptoms: ['selected-source timeout is downstream'],
      transitionTable: [
        {
          inputSignal: 'active_gate_timed_out',
          owner: 'startup_active_gate_owner / snapshot_coverage',
          missingTransition: 'source coverage progress transition',
          expectedEvidence: 'focused proof and representative rerun move coverage',
          falsifier: 'npm run work:scenario-route -- test-output/reports/rolling-restart.report.json',
          migrationTrigger: 'route names a different owner',
        },
      ],
      ownershipMigrationTriggers: ['falsifier names a different owner'],
      architectureGapTriggers: ['no owner-owned transition can be named'],
      wholeSystemInvariant: 'Do not patch downstream symptoms until the owner transition moves.',
    },
    sliceTheory: {
      systemTheoryRef: 'work/packages/active-theory-loop.md systemTheory',
      selectedSystemTheory: 'Snapshot service source contract is selected.',
      selectedMechanism: 'contract_gap',
      sourceTestContract: 'Change src/control-plane/snapshot-service.js and prove coverage movement.',
      falsifier: 'npm run work:scenario-route -- test-output/reports/rolling-restart.report.json',
      representativeExpectedMovement: 'coverage moves or owner boundary migrates',
      killRule: 'same-frontier evidence opens a different successor theory',
      theoryFitScore: {
        evidenceFit: 'high - route selects this boundary',
        ownerBoundaryFit: 'high - source file is in owner boundary',
        falsifiability: 'high - representative route can disprove it',
        representativeMovement: 'medium - movement must be measured after source change',
        downstreamRiskContainment: 'high - source scope is narrow',
      },
      wrongSliceTriggers: ['proof selects a different owner'],
    },
    ...overrides,
  };
}

function theoryLoopContent(evidence = '') {
  return [
    '# Theory Loop Package',
    '',
    '## Theory Loop',
    '',
    '- Promoted modification scope:',
    '- src/control-plane/snapshot-service.js',
    '',
    evidence,
  ].join('\n');
}

test('theory-loop package validator rejects classification-only and non-source packages', (t) => {
  const classificationErrors = validateTheoryLoopPackageContract(
    theoryLoopContent(),
    theoryLoopMetadata({
      representativeResidual: {
        status: 'classification-only',
      },
    }),
    'work/packages/active-theory-loop.md',
    {status: 'active'},
  );
  const testOnlyErrors = validateTheoryLoopPackageContract(
    theoryLoopContent(),
    theoryLoopMetadata({
      writeScope: ['test/distributed/rolling-restart.test.js'],
      commitScope: ['test/distributed/rolling-restart.test.js'],
    }),
    'work/packages/active-theory-loop.md',
    {status: 'active'},
  );
  const globOnlyErrors = validateTheoryLoopPackageContract(
    theoryLoopContent(),
    theoryLoopMetadata({
      writeScope: ['src/control-plane/*.js'],
      commitScope: ['src/control-plane/*.js'],
      sliceTheory: {
        ...theoryLoopMetadata().sliceTheory,
        sourceTestContract: 'Change src/control-plane/*.js after source discovery.',
      },
    }),
    'work/packages/active-theory-loop.md',
    {status: 'active'},
  );

  t.match(classificationErrors.join('\n'), /cannot be classification-only/u);
  t.match(testOnlyErrors.join('\n'), /writeScope must include at least one concrete src\/ \.js source file/u);
  t.match(testOnlyErrors.join('\n'), /commitScope must include the promoted concrete src\/ \.js source file/u);
  t.match(globOnlyErrors.join('\n'), /concrete src\/ \.js source file/u);
  t.match(globOnlyErrors.join('\n'), /concrete src\/ \.js source-code contract/u);
  t.end();
});

test('theory-loop package validator rejects model-only and non-executable source contracts', (t) => {
  const modelOnlyErrors = validateTheoryLoopPackageContract(
    theoryLoopContent(),
    theoryLoopMetadata({
      writeScope: ['test/model/priority-recovery-model.test.js'],
      commitScope: ['test/model/priority-recovery-model.test.js'],
      modelTheory: {
        modelKind: 'state-model',
        executableArtifact: 'test/model/priority-recovery-model.test.js',
        propertiesProven: ['handoff eventually progresses'],
        assumptions: ['none'],
        counterExampleHandling: 'record counterexample and reject the theory',
        linkedSystemTheoryRef: 'work/packages/active-theory-loop.md systemTheory',
      },
    }),
    'work/packages/active-theory-loop.md',
    {status: 'active'},
  );
  const nonExecutableErrors = validateTheoryLoopPackageContract(
    theoryLoopContent(),
    theoryLoopMetadata({
      sliceTheory: {
        ...theoryLoopMetadata().sliceTheory,
        sourceTestContract: 'Do not edit new source in this metadata pass; create a successor package after reading src/control-plane/snapshot-service.js.',
      },
    }),
    'work/packages/active-theory-loop.md',
    {status: 'active'},
  );

  t.match(modelOnlyErrors.join('\n'), /writeScope must include at least one concrete src\/ \.js source file/u);
  t.match(modelOnlyErrors.join('\n'), /commitScope must include the promoted concrete src\/ \.js source file/u);
  t.match(nonExecutableErrors.join('\n'), /must describe an executable source edit/u);
  t.end();
});

test('theory-loop package closure requires source implementation evidence and successor', (t) => {
  const missingClosureErrors = validateTheoryLoopPackageContract(
    theoryLoopContent(),
    theoryLoopMetadata({
      status: 'done',
      theoryLoop: {
        ...theoryLoopMetadata().theoryLoop,
        result: 'fixed',
      },
    }),
    'work/packages/done-theory-loop.md',
    {status: 'done', phase: 'closure'},
  );
  const validErrors = validateTheoryLoopPackageContract(
    theoryLoopContent([
      '## Execution Evidence',
      '',
      '- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/control-plane/snapshot-service.js; validation: npm test -- test/distributed/harness/__tests__/rolling-restart.test.js and parent revalidated focused proof: yes; outcome: validated.',
    ].join('\n')),
    theoryLoopMetadata({
      status: 'done',
      theoryLoop: {
        ...theoryLoopMetadata().theoryLoop,
        result: 'fixed',
        successorPackage: 'work/packages/todo-20260528-next-theory-loop.md',
      },
    }),
    'work/packages/done-theory-loop.md',
    {status: 'done', phase: 'closure', successorExists: true},
  );

  t.match(missingClosureErrors.join('\n'), /files-changed under src\//u);
  t.match(missingClosureErrors.join('\n'), /must create and link a successor package/u);
  t.same(validErrors, []);
  t.end();
});

test('theory-loop package proof rejects empty representative rerun paths', (t) => {
  const emptyPathErrors = validateTheoryLoopPackageContract(
    theoryLoopContent(),
    theoryLoopMetadata({
      proof: [
        'falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart.report.json',
        'regression: npm test -- test/distributed/harness/__tests__/rolling-restart.test.js',
        'supporting: timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output "" --fast-local --verbose && npm run work:package:route-after-rerun -- --artifact "" --package work/packages/active-theory-loop.md',
      ],
    }),
    'work/packages/active-theory-loop.md',
    {status: 'active'},
  );
  const malformedReportErrors = validateTheoryLoopPackageContract(
    theoryLoopContent(),
    theoryLoopMetadata({
      proof: [
        'falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart.report.json',
        'regression: npm test -- test/distributed/harness/__tests__/rolling-restart.test.js',
        'supporting: timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/theory-loop-.report.json --fast-local --verbose',
      ],
    }),
    'work/packages/active-theory-loop.md',
    {status: 'active'},
  );

  t.match(emptyPathErrors.join('\n'), /empty --artifact or --output value/u);
  t.match(malformedReportErrors.join('\n'), /ending in -\.report\.json/u);
  t.end();
});

test('theory-loop sprint closure needs explicit success evidence', (t) => {
  const unfinishedSprint = [
    '# Sprint',
    '',
    'Status: done.',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Option Set',
    '',
    '1. H1',
    '',
    '## Discriminator First',
    '',
    '- run the discriminator',
    '',
    '## Real Package Rule',
    '',
    '- source packages only',
  ].join('\n');
  const finishedSprint = [
    unfinishedSprint,
    '',
    '## Theory Loop Success Evidence',
    '',
    '- Success condition met: yes',
    '- Matched success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '- Fresh representative evidence: npm run work:scenario-route -- test-output/reports/rolling-restart-green.report.json',
    '- Result: success-condition-met',
    '- Continuation stopped because: the representative success condition is met.',
  ].join('\n');
  const alternateMetricSprint = finishedSprint.replace(
    '- Result: success-condition-met',
    '- Result: architecture-gap',
  );
  const mismatchedSuccessSprint = finishedSprint.replace(
    '- Matched success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '- Matched success condition: architecture-gap',
  );
  const alternateStartMetricSprint = finishedSprint
    .replace(
      '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
      '- Success condition: rolling-restart representative run passes or closes as architecture-gap',
    )
    .replace(
      '- Matched success condition: rolling-restart representative run passes with all nodes ACTIVE',
      '- Matched success condition: rolling-restart representative run passes or closes as architecture-gap',
    );

  t.match(
    validateTheoryLoopSprintClosure(
      unfinishedSprint,
      'work/sprints/done-theory-loop.md',
      {status: 'done'},
    ).join('\n'),
    /must continue until the original success condition is met/u,
  );
  t.match(
    validateTheoryLoopSprintClosure(
      alternateMetricSprint,
      'work/sprints/done-theory-loop.md',
      {status: 'done'},
    ).join('\n'),
    /must be success-condition-met/u,
  );
  t.match(
    validateTheoryLoopSprintClosure(
      mismatchedSuccessSprint,
      'work/sprints/done-theory-loop.md',
      {status: 'done'},
    ).join('\n'),
    /must exactly match/u,
  );
  t.match(
    validateTheoryLoopSprintClosure(
      alternateStartMetricSprint,
      'work/sprints/done-theory-loop.md',
      {status: 'done'},
    ).join('\n'),
    /must name the original representative or release success metric/u,
  );
  t.same(
    validateTheoryLoopSprintClosure(
      finishedSprint,
      'work/sprints/done-theory-loop.md',
      {status: 'done'},
    ),
    [],
  );
  t.end();
});

test('theory-loop package scaffolder enforces src scope and emits marker metadata', async (t) => {
  await t.rejects(
    buildPackageContent({
      'title': 'Theory Loop Bad Package',
      'slug': 'theory-loop-bad-package',
      'lane': 'causal-escalation',
      'owner': 'startup_active_gate_owner',
      'boundary': 'snapshot_coverage',
      'dominant-reason': 'active_gate_timed_out',
      'next-action': 'Test a promoted theory.',
      'proof': [
        'falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart.report.json',
        'regression: npm test -- test/distributed/harness/__tests__/rolling-restart.test.js',
      ],
      'write-scope': ['test/distributed/harness/__tests__/rolling-restart.test.js'],
      'theory-loop': true,
      'ledger': 'test-output/missing-ledger.jsonl',
    }),
    /require at least one concrete --write-scope file under src\/ ending in \.js/u,
  );
  await t.rejects(
    buildPackageContent({
      'title': 'Theory Loop Missing Proof Roles',
      'slug': 'theory-loop-missing-proof-roles',
      'lane': 'causal-escalation',
      'owner': 'startup_active_gate_owner',
      'boundary': 'snapshot_coverage',
      'dominant-reason': 'active_gate_timed_out',
      'next-action': 'Test a promoted theory.',
      'proof': ['npm test -- test/distributed/harness/__tests__/rolling-restart.test.js'],
      'write-scope': ['src/control-plane/snapshot-service.js'],
      'theory-loop': true,
      'ledger': 'test-output/missing-ledger.jsonl',
    }),
    /require a proof command prefixed with falsifier:/u,
  );

  const content = await buildPackageContent({
    'title': 'Theory Loop Source Package',
    'slug': 'theory-loop-source-package',
    'lane': 'causal-escalation',
    'owner': 'startup_active_gate_owner',
    'boundary': 'snapshot_coverage',
    'dominant-reason': 'active_gate_timed_out',
    'next-action': 'Test a promoted theory.',
    'proof': [
      'falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart.report.json',
      'regression: npm test -- test/distributed/harness/__tests__/rolling-restart.test.js',
    ],
    'write-scope': ['src/control-plane/snapshot-service.js'],
    'theory-loop': true,
    'ledger': 'test-output/missing-ledger.jsonl',
  });
  const metadata = parsePackageMetadata(
    content,
    'work/packages/todo-20260528-theory-loop-source-package.md',
  );

  t.equal(metadata.theoryLoop.enforcement, 'source-code-package-required');
  t.equal(metadata.observablePrediction.evidence, 'pending-before-representative-rerun');
  t.match(content, /## Theory Loop Package Contract/u);
  t.match(content, /## Observable Prediction/u);
  t.match(content, /Forbidden stop shape: .*package-only/u);
  t.notMatch(content, /close as classification-only/u);
  t.match(content, /Required source write: `src\/control-plane\/snapshot-service\.js`/u);
});

test('sprint advance refuses theory-loop closure before success evidence', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  t.teardown(async () => {
    await fs.rm(root, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(root, 'work/packages'), {recursive: true});
  await fs.mkdir(path.join(root, 'work/sprints'), {recursive: true});
  await fs.writeFile(
    path.join(root, 'work/sprints/active-theory-loop.md'),
    [
      '# Sprint',
      '',
      'Status: active.',
      '',
      '## Theory Option Set',
      '',
      '1. H1',
      '',
      '## Discriminator First',
      '',
      '- run the discriminator',
      '',
      '## Real Package Rule',
      '',
      '- source packages only',
    ].join('\n'),
    ENCODING_UTF8,
  );

  await t.rejects(
    buildSprintAdvancePlan({root}),
    /continue indefinitely until the original success condition is met/u,
  );
});

test('current edge card does not present classification-only as a theory-loop stop mode', (t) => {
  const card = renderCurrentEdgeCardSection({
    artifact: 'test-output/reports/rolling-restart.report.json',
    package: 'work/packages/active-theory-loop.md',
    owner: 'startup_active_gate_owner',
    boundary: 'snapshot_coverage',
    dominantReason: 'active_gate_timed_out',
    nextAction: 'Change source and create the successor package.',
    representativeResidual: {status: 'active-theory-loop'},
    proof: ['falsifier: npm run work:scenario-route -- artifact.json'],
    writeScope: ['src/control-plane/snapshot-service.js'],
    candidateRuntimeFiles: [],
  });

  t.match(card, /Allowed stop modes: success-condition-met only/u);
  t.match(card, /architecture-gap, same-frontier, classification-only, needs-rerun, pending, and unknown are package outcomes/u);
  t.notMatch(card, /Allowed stop modes:.*same-frontier, classification-only, architecture-gap/u);
  t.end();
});
