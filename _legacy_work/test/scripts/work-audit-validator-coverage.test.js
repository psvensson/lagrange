import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  buildValidatorCoverageAudit,
  extractValidatorFunctions,
  parseArgs,
  renderValidatorCoverageAudit,
  runCli,
} from '../../scripts/work-audit-validator-coverage.js';

const TEMP_PREFIX = 'work-audit-validator-coverage-';
const ENCODING_UTF8 = 'utf8';

async function makeTempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  t.teardown(async () => {
    await fs.rm(root, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(root, 'scripts'), {recursive: true});
  await fs.mkdir(path.join(root, 'test', 'scripts'), {recursive: true});
  return root;
}

test('validator audit extracts exported and local validation functions', (t) => {
  const validators = extractValidatorFunctions([
    'export function validateAlpha(metadata, filePath) {',
    '  const errors = [];',
    '  errors.push(`${filePath}: alpha failed; run npm run alpha:fix.`);',
    '  return errors;',
    '}',
    'function validateBeta(filePath) {',
    '  return [`${filePath}: beta failed.`];',
    '}',
  ].join('\n'));

  t.same(validators.map((validator) => validator.name), [
    'validateAlpha',
    'validateBeta',
  ]);
  t.equal(validators[0].exported, true);
  t.equal(validators[0].repairHintCount, 1);
  t.equal(validators[1].exported, false);
  t.end();
});

test('validator audit reports missing tests and missing repair hints',
  async (t) => {
    const root = await makeTempRoot(t);
    await fs.writeFile(
      path.join(root, 'scripts', 'work-tracker.js'),
      [
        'export function validateAlpha(metadata, filePath) {',
        '  const errors = [];',
        '  errors.push(`${filePath}: alpha failed; run npm run alpha:fix.`);',
        '  return errors;',
        '}',
        'export function validateBeta(metadata, filePath) {',
        '  return [`${filePath}: beta failed.`];',
        '}',
      ].join('\n'),
      ENCODING_UTF8,
    );
    await fs.writeFile(
      path.join(root, 'test', 'scripts', 'work-tracker-alpha.test.js'),
      'validateAlpha({});\n',
      ENCODING_UTF8,
    );

    const audit = await buildValidatorCoverageAudit({root});
    const rendered = renderValidatorCoverageAudit(audit, {limit: 10});

    t.equal(audit.totals.validators, 2);
    t.equal(audit.totals.validatorsWithTests, 1);
    t.equal(audit.totals.validatorsWithoutTests, 1);
    t.equal(audit.totals.validatorsMissingRepairHints, 1);
    t.match(rendered, '`validateBeta`: needs-test-signal; needs-repair-hint');
  });

test('validator audit json output is machine-readable', async (t) => {
  const root = await makeTempRoot(t);
  await fs.writeFile(
    path.join(root, 'scripts', 'work-tracker.js'),
    'export function validateAlpha() { return []; }\n',
    ENCODING_UTF8,
  );
  const output = await runCli(['--json'], {root});
  const parsed = JSON.parse(output);

  t.equal(parsed.totals.validators, 1);
  t.equal(parsed.validators[0].name, 'validateAlpha');
});

test('validator audit argument parser supports details, json, and limits', (t) => {
  t.same(parseArgs(['--details', '--json', '--limit', '0']), {
    details: true,
    json: true,
    limit: 0,
    help: false,
  });
  t.end();
});
