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
