import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  assertScanCompleteness,
  collectRuleViolations,
  collectScanCompleteness,
  evaluateIdentitySeverityRatchet,
} from '../../scripts/metric-check-helpers.js';

const RULE_COMPLEXITY = 'complexity';
const ANALYZER_ESLINT = 'eslint';

test('collectRuleViolations preserves inventory fields and extracts subject and severity', () => {
  const sampleFile = path.join(process.cwd(), 'src/example.js');
  const results = [
    {
      filePath: sampleFile,
      messages: [
        {
          ruleId: RULE_COMPLEXITY,
          line: 42,
          column: 3,
          message:
            'Async method \'reconcileState\' has a complexity of 14. ' +
            'Maximum allowed is 12.',
        },
        {
          ruleId: 'no-unused-vars',
          line: 10,
          column: 1,
          message: '\'unused\' is assigned a value but never used.',
        },
      ],
    },
  ];

  const violations = collectRuleViolations(results, RULE_COMPLEXITY);
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0], {
    filePath: 'src/example.js',
    line: 42,
    column: 3,
    message:
      'Async method \'reconcileState\' has a complexity of 14. ' +
      'Maximum allowed is 12.',
    severity: 14,
    subject: 'Async method \'reconcileState\'',
  });
});

test('collectScanCompleteness and assertScanCompleteness fail on parser fatal errors or empty scans', () => {
  const cleanFile = path.join(process.cwd(), 'src/clean.js');
  const brokenFile = path.join(process.cwd(), 'src/broken.js');

  const emptyCompleteness = collectScanCompleteness([], {
    ruleId: RULE_COMPLEXITY,
    targets: ['src/'],
    analyzer: ANALYZER_ESLINT,
  });
  assert.equal(emptyCompleteness.analyzedFiles, 0);
  assert.equal(emptyCompleteness.failedFiles, 0);
  assert.equal(emptyCompleteness.complete, false);
  assert.throws(
    () => assertScanCompleteness(emptyCompleteness, RULE_COMPLEXITY),
    /Scan completeness check FAILED for complexity: analyzedFiles=0, failedFiles=0/u,
  );

  const fatalResults = [
    {
      filePath: cleanFile,
      messages: [],
    },
    {
      filePath: brokenFile,
      messages: [
        {
          ruleId: null,
          fatal: true,
          line: 19,
          column: 7,
          message: 'Parsing error: Unexpected token }',
        },
      ],
    },
  ];

  const fatalCompleteness = collectScanCompleteness(fatalResults, {
    ruleId: RULE_COMPLEXITY,
    targets: [cleanFile, brokenFile],
    analyzer: ANALYZER_ESLINT,
  });
  assert.equal(fatalCompleteness.analyzedFiles, 2);
  assert.equal(fatalCompleteness.failedFiles, 1);
  assert.equal(fatalCompleteness.skippedFiles, 0);
  assert.equal(fatalCompleteness.complete, false);
  assert.deepEqual(fatalCompleteness.parserFatalErrors, [
    {
      filePath: 'src/broken.js',
      line: 19,
      column: 7,
      message: 'Parsing error: Unexpected token }',
    },
  ]);

  assert.throws(
    () => assertScanCompleteness(fatalCompleteness, RULE_COMPLEXITY),
    /src\/broken\.js:19:7 Parsing error: Unexpected token \}/u,
  );

  // Partial scan against a directory or expected file census must report skippedFiles > 0.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-completeness-'));
  try {
    const fileA = path.join(tmpDir, 'a.js');
    const fileB = path.join(tmpDir, 'b.mjs');
    const fileC = path.join(tmpDir, 'c.cjs');
    fs.writeFileSync(fileA, 'export const a = 1;\n');
    fs.writeFileSync(fileB, 'export const b = 2;\n');
    fs.writeFileSync(fileC, 'module.exports = 3;\n');

    const partialDirCompleteness = collectScanCompleteness(
      [{filePath: fileA, messages: []}],
      {
        ruleId: RULE_COMPLEXITY,
        targets: [tmpDir],
        analyzer: ANALYZER_ESLINT,
      },
    );
    assert.equal(partialDirCompleteness.analyzedFiles, 1);
    assert.equal(partialDirCompleteness.failedFiles, 0);
    assert.equal(partialDirCompleteness.skippedFiles, 2);
    assert.equal(partialDirCompleteness.complete, false);
    assert.throws(
      () => assertScanCompleteness(partialDirCompleteness, RULE_COMPLEXITY),
      /skippedFiles=2/u,
    );

    const fullDirCompleteness = collectScanCompleteness(
      [
        {filePath: fileA, messages: []},
        {filePath: fileB, messages: []},
        {filePath: fileC, messages: []},
      ],
      {
        ruleId: RULE_COMPLEXITY,
        targets: [tmpDir],
        analyzer: ANALYZER_ESLINT,
      },
    );
    assert.equal(fullDirCompleteness.analyzedFiles, 3);
    assert.equal(fullDirCompleteness.skippedFiles, 0);
    assert.equal(fullDirCompleteness.complete, true);
    assert.equal(
      assertScanCompleteness(fullDirCompleteness, RULE_COMPLEXITY),
      fullDirCompleteness,
    );
  } finally {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }

  const validCompleteness = collectScanCompleteness(
    [{filePath: cleanFile, messages: []}],
    {
      ruleId: RULE_COMPLEXITY,
      targets: [cleanFile],
      analyzer: ANALYZER_ESLINT,
    },
  );
  assert.equal(validCompleteness.complete, true);
  assert.equal(
    assertScanCompleteness(validCompleteness, RULE_COMPLEXITY),
    validCompleteness,
  );
});

test('evaluateIdentitySeverityRatchet fails when removing one violation and adding another', () => {
  const baselineEntries = {
    'src/alpha.js::Function \'legacyA\'#1': 14,
    'src/beta.js::Function \'legacyB\'#1': 16,
  };

  // legacyA is removed, but newC is added (total count stays 2).
  const violations = [
    {
      filePath: 'src/beta.js',
      line: 20,
      column: 1,
      message: 'Function \'legacyB\' has a complexity of 16. Maximum allowed is 12.',
      subject: 'Function \'legacyB\'',
      severity: 16,
    },
    {
      filePath: 'src/gamma.js',
      line: 10,
      column: 1,
      message: 'Function \'newC\' has a complexity of 13. Maximum allowed is 12.',
      subject: 'Function \'newC\'',
      severity: 13,
    },
  ];

  const evaluation = evaluateIdentitySeverityRatchet({
    violations,
    baselineEntries,
  });

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.newViolations.length, 1);
  assert.equal(
    evaluation.newViolations[0].identity,
    'src/gamma.js::Function \'newC\'#1',
  );
  assert.equal(evaluation.newViolations[0].severity, 13);
  assert.deepEqual(evaluation.worsenedViolations, []);
  assert.deepEqual(evaluation.removedIdentities, [
    'src/alpha.js::Function \'legacyA\'#1',
  ]);
});

test('evaluateIdentitySeverityRatchet fails when an existing violation worsens from 14 to 15', () => {
  const baselineEntries = {
    'src/alpha.js::Function \'planRoute\'#1': 14,
    'src/alpha.js::Arrow function#1': 13,
    'src/alpha.js::Arrow function#2': 15,
  };

  const violations = [
    {
      filePath: 'src/alpha.js',
      line: 12,
      column: 1,
      message:
        'Function \'planRoute\' has a complexity of 15. Maximum allowed is 12.',
      subject: 'Function \'planRoute\'',
      severity: 15,
    },
    {
      filePath: 'src/alpha.js',
      line: 48,
      column: 5,
      message: 'Arrow function has a complexity of 13. Maximum allowed is 12.',
      subject: 'Arrow function',
      severity: 13,
    },
    {
      filePath: 'src/alpha.js',
      line: 90,
      column: 5,
      message: 'Arrow function has a complexity of 14. Maximum allowed is 12.',
      subject: 'Arrow function',
      severity: 14,
    },
  ];

  const evaluation = evaluateIdentitySeverityRatchet({
    violations,
    baselineEntries,
  });

  assert.equal(evaluation.ok, false);
  assert.deepEqual(evaluation.newViolations, []);
  assert.equal(evaluation.worsenedViolations.length, 1);
  assert.equal(
    evaluation.worsenedViolations[0].identity,
    'src/alpha.js::Function \'planRoute\'#1',
  );
  assert.equal(evaluation.worsenedViolations[0].baselineSeverity, 14);
  assert.equal(evaluation.worsenedViolations[0].severity, 15);
  assert.equal(evaluation.improvedViolations.length, 1);
  assert.equal(
    evaluation.improvedViolations[0].identity,
    'src/alpha.js::Arrow function#2',
  );
  assert.equal(evaluation.improvedViolations[0].baselineSeverity, 15);
  assert.equal(evaluation.improvedViolations[0].severity, 14);
});
