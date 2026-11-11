import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  analyzeExecution,
  parseAlloyExecutionOutput,
  parseAlloyReceipt,
  validateAlloyModel,
  validateAlloyModels,
  verifyAlloyArchive,
  verifyAlloyBinary,
} from '../../scripts/check-alloy-models.js';
import {validateDecisionTables} from '../../scripts/check-decision-tables.js';
import {validateStatecharts} from '../../scripts/check-statecharts.js';
import {validateSystemContracts} from '../../scripts/check-system-contracts.js';

const CONTRACT_FILES = [
  'architecture/contracts/active-gate-convergence.md',
  'architecture/contracts/core-system-logic.md',
  'architecture/contracts/quest-lifecycle.md',
  'architecture/contracts/rolling-restart-rebalancer-handoff.md',
].map((filePath) => path.resolve(filePath));

const DECISION_TABLE_FILES = [
  'docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json',
].map((filePath) => path.resolve(filePath));

const STATECHART_FILES = [
  'architecture/models/statecharts/core-system-logic.json',
  'docs/specs/statecharts/quest-lifecycle.json',
].map((filePath) => path.resolve(filePath));

const ALLOY_MODEL_FILES = [
  'architecture/models/alloy/core-system-logic.als',
].map((filePath) => path.resolve(filePath));

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'alloy-model-test-'));
}

tap.test('system contract records validate against real bindings', (t) => {
  const result = validateSystemContracts(CONTRACT_FILES);
  t.same(result.errors, []);
  t.equal(result.checkedFiles.length, CONTRACT_FILES.length);
  t.end();
});

tap.test('decision tables prove complete single-outcome coverage', (t) => {
  const result = validateDecisionTables(DECISION_TABLE_FILES);
  t.same(result.errors, []);
  t.equal(result.checkedFiles.length, DECISION_TABLE_FILES.length);
  t.end();
});

tap.test('statecharts validate legal lifecycle transitions', (t) => {
  const result = validateStatecharts(STATECHART_FILES);
  t.same(result.errors, []);
  t.equal(result.checkedFiles.length, STATECHART_FILES.length);
  t.end();
});

tap.test('Alloy models declare and check architecture invariants', async (t) => {
  const result = await validateAlloyModels(ALLOY_MODEL_FILES);
  t.same(result.errors, []);
  t.equal(result.checkedFiles.length, ALLOY_MODEL_FILES.length);
});

tap.test('Alloy result polarity rejects SAT checks and UNSAT runs', (t) => {
  const metadata = {
    runPredicates: ['ExampleRun'],
    forbiddenPredicates: ['ForbiddenRun'],
    invariantRefs: [{id: 'sample', assertion: 'SampleAssertion'}],
  };
  const parsed = parseAlloyExecutionOutput([
    '00. run ExampleRun 0 UNSAT',
    '01. run ForbiddenRun 0 SAT',
    '02. check SampleAssertion 0 SAT',
  ].join('\n'));
  const result = analyzeExecution(metadata, parsed);
  t.same(result.errors, [
    'run ExampleRun returned UNSAT; expected SAT.',
    'run ForbiddenRun returned SAT; expected UNSAT.',
    'check SampleAssertion returned SAT; expected UNSAT.',
  ]);
  t.end();
});

tap.test('Alloy receipt parser maps solutions to command polarity inputs', (t) => {
  const root = tmpDir();
  fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify({
    commands: {
      one: {
        type: 'run',
        name: 'ExampleRun',
        solution: [{}],
      },
      two: {
        type: 'run',
        name: 'ForbiddenRun',
        solution: [],
      },
      three: {
        type: 'check',
        name: 'SampleAssertion',
        solution: [],
      },
      ignored: {
        type: 'eval',
        name: 'IgnoredCommand',
        solution: [{}],
      },
    },
  }));
  t.same(parseAlloyReceipt(root), [
    {
      kind: 'run',
      name: 'ExampleRun',
      result: 'SAT',
      line: 'run ExampleRun from receipt.json',
    },
    {
      kind: 'run',
      name: 'ForbiddenRun',
      result: 'UNSAT',
      line: 'run ForbiddenRun from receipt.json',
    },
    {
      kind: 'check',
      name: 'SampleAssertion',
      result: 'UNSAT',
      line: 'check SampleAssertion from receipt.json',
    },
  ]);
  t.end();
});

tap.test('Alloy metadata invariant ids must be registered', (t) => {
  const root = tmpDir();
  const modelPath = path.join(root, 'bad.als');
  fs.writeFileSync(modelPath, [
    'module bad',
    '/*',
    'alloy-model',
    '{',
    '  "schema": "alloy-model-v1",',
    '  "modelId": "bad",',
    '  "owner": "architecture_owner",',
    '  "boundary": "core_system_logic",',
    '  "invariantRefs": [',
    '    {"id": "typo-invariant", "assertion": "SomeAssertion"}',
    '  ],',
    '  "runPredicates": ["Example"],',
    '  "forbiddenPredicates": []',
    '}',
    '*/',
    'pred Example {}',
    'assert SomeAssertion {}',
    'run Example for 1',
    'check SomeAssertion for 1',
  ].join('\n'));
  const result = validateAlloyModel(modelPath, {
    knownInvariantIds: new Set(['registered-invariant']),
  });
  t.ok(
    result.errors.some((error) =>
      error.includes('typo-invariant') && error.includes('not registered')),
  );
  t.end();
});

tap.test('Alloy archive checksum rejects unexpected downloads', (t) => {
  const root = tmpDir();
  const archivePath = path.join(root, 'alloy.tar.gz');
  fs.writeFileSync(archivePath, 'not the alloy release');
  t.throws(
    () => verifyAlloyArchive(archivePath),
    /Alloy archive checksum mismatch/u,
  );
  t.end();
});

tap.test('Alloy binary checksum rejects unexpected default binaries', (t) => {
  const root = tmpDir();
  const binaryPath = path.join(root, 'alloy');
  fs.writeFileSync(binaryPath, 'not the alloy binary');
  t.throws(
    () => verifyAlloyBinary(binaryPath),
    /Alloy binary checksum mismatch/u,
  );
  t.end();
});

function decisionTableControl(rule) {
  return {
    schema: 'decision-table-v1', id: 'validator-control',
    owner: 'control_policy_owner', boundary: 'unit_validation',
    inputs: [{name: 'signal', values: ['ready']}],
    outputs: [{name: 'result', values: ['allow']}],
    invariants: [{id: 'only-ready', statement: 'Only ready input may allow work.'}],
    rules: [rule],
  };
}

// These malformed declarations exercise the real validator, not a measured system.
tap.test('decision-rule validation retains refusal order and complete coverage', (t) => {
  const root = tmpDir();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const file = path.join(root, 'decision-table.json');
  const prefix = `${path.relative(process.cwd(), file)}: `;
  const validRule = {id: 'ready', reason: 'Ready input permits work.',
    invariantRefs: ['only-ready'], when: {signal: 'ready'}, outcome: {result: 'allow'}};
  const uncovered = 'combination {"signal":"ready"} matches 0 rules; expected exactly 1.';
  const controls = [
    {rule: validRule, errors: []},
    {rule: null, errors: ['rules[0] must be an object.', uncovered]},
    {rule: {...validRule, id: '', reason: '', invariantRefs: ['undeclared'],
      when: {extra: 'ready'}, outcome: {extra: 'allow'}}, errors: [
      'rules[0].id must be concrete text.',
      'rules[0].reason must be concrete text.',
      'rules[0].invariantRefs[0] does not match a declared invariant id: undeclared.',
      'rules[0].when.signal is required.',
      'rules[0].when.extra is not a declared input.',
      'rules[0].outcome.result is required.',
      'rules[0].outcome.extra is not declared.', uncovered,
    ]},
    {rule: {...validRule, when: {signal: 'invalid'}, outcome: {result: 'invalid'}},
      errors: ['rules[0].when.signal has invalid value invalid.',
        'rules[0].outcome.result has invalid value invalid.', uncovered]},
    {rule: {...validRule, when: null, outcome: null}, errors: [
      'rules[0].when must be an object.', 'rules[0].outcome must be an object.', uncovered,
    ]},
  ];
  for (const control of controls) {
    fs.writeFileSync(file, JSON.stringify(decisionTableControl(control.rule)));
    t.same(validateDecisionTables([file]).errors,
      control.errors.map((message) => prefix + message));
  }
  t.end();
});
