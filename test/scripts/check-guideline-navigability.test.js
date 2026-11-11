/**
 * The navigability audit is a one-way ratchet over the shared detector module
 * (scripts/checks/code-navigability-detectors.js). These scenarios drive the
 * real CLI entry (`main`) in a child process over a fixture tree, with a
 * stand-in detector injected through `main`'s options: each fake detector
 * reports one site per `mark_<row>()` call, so the audit's own bookkeeping
 * (domain filtering, per-pattern baselines, line-independent identity, the
 * tighten hint, --pattern, --json) is proven without the real detection. The
 * last scenario runs the real audit over `src` once the detector module and
 * the twelve baselines exist; until both are present it fails loudly.
 */

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {NAVIGABILITY_PATTERN} from '../../scripts/check-guideline-navigability.js';
import {defaultEslintRunner, promotedPatterns} from
  '../../scripts/checks/code-navigability-eslint-promotion.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const AUDIT_SCRIPT = path.join(REPO_ROOT, 'scripts/check-guideline-navigability.js');
const SHARED_MODULE = path.join(REPO_ROOT, 'scripts/guideline-check-shared.js');
const DETECTOR_MODULE = path.join(
  REPO_ROOT, 'scripts/checks/code-navigability-detectors.js');
const ENCODING = 'utf8';
const CHILD_TIMEOUT_MS = 30_000;
const INTEGRATION_TIMEOUT_MS = 170_000;
const BASELINE_DIRECTORY = 'baselines';
const CALLS_PREFIX = 'DETECTOR_CALLS ';
const PROMOTED_ENV = 'NAVIGABILITY_TEST_PROMOTED';

const PATTERN_DETECTORS = Object.freeze({
  owner_port_feature_detection: 'detectOwnerPortFeatureDetection',
  identity_keyed_module_state: 'detectIdentityKeyedModuleState',
  prototype_copy_bags: 'detectPrototypeCopyBags',
  row_field_alias_reads: 'detectRowFieldAliasReads',
  state_read_defaults: 'detectStateReadDefaults',
  value_or_promise_then_checks: 'detectValueOrPromiseThenChecks',
  two_source_fallback_reads: 'detectTwoSourceFallbackReads',
  typeof_dual_paths: 'detectTypeofDualPaths',
  catch_returns_default: 'detectCatchReturnsDefault',
  alias_exports: 'detectAliasExports',
  legacy_term_identifiers: 'detectLegacyTermIdentifiers',
});
const INHERITANCE_ROW = 'inheritance_depth_over_two';
const ALL_ROWS = Object.freeze([...Object.keys(PATTERN_DETECTORS), INHERITANCE_ROW]);
const EPIC_BUDGET_ROWS = Object.freeze([
  'owner_port_feature_detection', 'identity_keyed_module_state', 'prototype_copy_bags',
  'inheritance_depth_over_two', 'row_field_alias_reads', 'state_read_defaults',
  'value_or_promise_then_checks', 'two_source_fallback_reads', 'typeof_dual_paths',
  'catch_returns_default', 'alias_exports', 'legacy_term_identifiers',
]);

// A stand-in for the detector module: same exported names and site shape,
// detection replaced by a marker call so every expectation is exact.
const FAKE_DETECTORS_SOURCE = `
import {parseSourceFile, walkAst} from ${JSON.stringify(pathToFileURL(SHARED_MODULE).href)};
export const calls = [];
export function parseNavigabilitySource(text, file) {
  return {file, text, ast: parseSourceFile(text)};
}
function markerSites(parsed, row) {
  const sites = [];
  walkAst(parsed.ast, (node) => {
    if (node.type === 'CallExpression' && node.callee.name === 'mark_' + row) {
      sites.push({row, file: parsed.file, range: node.range, loc: node.loc,
        hash: 'h', occurrence: 0, kind: row, detail: ''});
    }
  });
  return sites;
}
for (const [row, name] of Object.entries(${JSON.stringify(PATTERN_DETECTORS)})) {
  globalThis[name] = (parsed) => {
    calls.push(name);
    return markerSites(parsed, row);
  };
}
export const {${Object.values(PATTERN_DETECTORS).join(', ')}} = globalThis;
export function detectInheritanceDepthOverTwo(parsedFiles) {
  calls.push('detectInheritanceDepthOverTwo');
  return parsedFiles.flatMap((parsed) =>
    markerSites(parsed, ${JSON.stringify(INHERITANCE_ROW)}));
}
`;

const DRIVER_SOURCE = `
import * as detectors from './fake-detectors.mjs';
import {main} from ${JSON.stringify(pathToFileURL(AUDIT_SCRIPT).href)};
const baselineDirectoryUrl = new URL('./${BASELINE_DIRECTORY}/', import.meta.url);
// ESLint stand-in: --print-config resolves one no-restricted-syntax entry at
// error severity per promoted row named in the environment.
const promoted = (process.env.${PROMOTED_ENV} || '').split(',').filter(Boolean);
const eslintRunner = (args) => {
  if (args[0] !== '--print-config') return {status: 2, stdout: ''};
  const entries = promoted.map((row) => ({selector: 'Program',
    message: 'write the replacement form. navigability-rule:' + row}));
  return {status: 0,
    stdout: JSON.stringify({rules: {'no-restricted-syntax': [2, ...entries]}})};
};
const exitCode = await main(process.argv.slice(2),
  {detectors, baselineDirectoryUrl, eslintRunner});
process.stderr.write(${JSON.stringify(CALLS_PREFIX)} +
  JSON.stringify([...new Set(detectors.calls)]) + '\\n');
process.exitCode = exitCode;
`;

const ALPHA_SOURCE = [
  'export function first() {',
  '  mark_owner_port_feature_detection();',
  '}',
  'export function second() {',
  '  mark_owner_port_feature_detection();',
  '  try { run(); } catch (error) { mark_catch_returns_default(); }',
  '}',
  '',
].join('\n');

const BETA_SOURCE = [
  'export class Gamma {',
  '  run() { mark_inheritance_depth_over_two(); }',
  '}',
  '',
].join('\n');

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guideline-navigability-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  write(root, 'fake-detectors.mjs', FAKE_DETECTORS_SOURCE);
  write(root, 'driver.mjs', DRIVER_SOURCE);
  write(root, 'src/alpha.js', ALPHA_SOURCE);
  write(root, 'src/beta.js', BETA_SOURCE);
  write(root, 'docs/outside.js', 'mark_owner_port_feature_detection();\n');
  fs.mkdirSync(path.join(root, BASELINE_DIRECTORY));
  return root;
}

function audit(root, args, promoted = []) {
  const result = spawnSync(process.execPath, ['driver.mjs', ...args], {
    cwd: root, encoding: ENCODING, timeout: CHILD_TIMEOUT_MS,
    env: {...process.env, [PROMOTED_ENV]: promoted.join(',')},
  });
  assert.equal(result.error, undefined, `audit child failed to run: ${result.error}`);
  const callsLine = result.stderr.split('\n').find((line) => line.startsWith(CALLS_PREFIX));
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls: callsLine ? JSON.parse(callsLine.slice(CALLS_PREFIX.length)) : [],
  };
}

function auditJson(root, args = [], promoted = []) {
  const result = audit(root, ['--json', ...args], promoted);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function baselineFile(root, row) {
  return path.join(root, BASELINE_DIRECTORY,
    `check-guideline-navigability-baseline-${row}.json`);
}

function readBaseline(root, row) {
  return JSON.parse(fs.readFileSync(baselineFile(root, row), ENCODING));
}

test('the audit governs exactly the twelve ratcheted budget rows', () => {
  assert.deepEqual(Object.values(NAVIGABILITY_PATTERN).sort(), [...EPIC_BUDGET_ROWS].sort());
  assert.deepEqual([...ALL_ROWS].sort(), [...EPIC_BUDGET_ROWS].sort());
});

test('a violation with no baseline fails and names the replacement form', (t) => {
  const root = fixture(t);
  const result = audit(root, []);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Found 4 navigability violations/);
  const report = auditJson(root);
  const sites = report.violations.map((v) => `${v.filePath}|${v.kind}|${v.functionName}`);
  assert.deepEqual(sites.sort(), [
    'src/alpha.js|catch_returns_default|second',
    'src/alpha.js|owner_port_feature_detection|first',
    'src/alpha.js|owner_port_feature_detection|second',
    'src/beta.js|inheritance_depth_over_two|run',
  ]);
  const ownerPort = report.violations.find((v) => v.kind === 'owner_port_feature_detection');
  assert.match(ownerPort.reason, /named collaborator/);
  assert.match(ownerPort.ruleReference, /Navigability and fallback patterns/);
  assert.equal(ownerPort.line, 2);
  assert.equal(ownerPort.column, 2);
});

test('--update-baseline writes one shared-shape baseline per pattern', (t) => {
  const root = fixture(t);
  const result = audit(root, ['--update-baseline']);
  assert.equal(result.status, 0, result.stderr);
  for (const row of ALL_ROWS) {
    const baseline = readBaseline(root, row);
    assert.deepEqual(Object.keys(baseline).sort(),
      ['generatedAt', 'rawViolationCount', 'version', 'violations']);
    assert.equal(baseline.version, 1);
    assert.equal(baseline.rawViolationCount, baseline.violations.length);
    assert.ok(baseline.violations.every((v) => v.kind === row), row);
  }
  assert.equal(readBaseline(root, 'owner_port_feature_detection').rawViolationCount, 2);
  assert.equal(readBaseline(root, 'inheritance_depth_over_two').rawViolationCount, 1);
  assert.equal(readBaseline(root, 'alias_exports').rawViolationCount, 0);
});

test('inherited violations pass and are counted in the summary', (t) => {
  const root = fixture(t);
  assert.equal(audit(root, ['--update-baseline']).status, 0);
  // Moving every site down keeps the line-independent identity.
  write(root, 'src/alpha.js', `\n\n\n${ALPHA_SOURCE}`);
  const result = audit(root, []);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /Found 0 navigability violations/);
  assert.match(result.stdout, /Matched 4 inherited navigability baseline violations/);
});

test('growth over a baseline fails on the new site only', (t) => {
  const root = fixture(t);
  assert.equal(audit(root, ['--update-baseline']).status, 0);
  write(root, 'src/alpha.js', ALPHA_SOURCE.replace(
    'export function first() {',
    'export function first() {\n  mark_owner_port_feature_detection();'));
  const result = audit(root, []);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /Found 1 navigability violations/);
  assert.match(result.stdout, /src\/alpha\.js:\d+ first owner_port_feature_detection/);
  const report = auditJson(root);
  assert.equal(report.inheritedViolationCount, 4);
  assert.deepEqual(report.violations.map((v) => v.functionName), ['first']);
});

test('a count below its baseline prints the tighten hint', (t) => {
  const root = fixture(t);
  assert.equal(audit(root, ['--update-baseline']).status, 0);
  write(root, 'src/alpha.js', ALPHA_SOURCE.replace(
    '  mark_owner_port_feature_detection();\n}', '}'));
  const result = audit(root, []);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout,
    /Baseline can be tightened from 2 to 1 in navigability owner_port_feature_detection: /);
  assert.doesNotMatch(result.stdout, /tightened from \d+ to \d+ in navigability catch_/);
});

test('--update-baseline never raises a recorded count', (t) => {
  const root = fixture(t);
  assert.equal(audit(root, ['--update-baseline']).status, 0);
  const before = fs.readFileSync(baselineFile(root, 'catch_returns_default'), ENCODING);
  write(root, 'src/gamma.js', 'function grow() { mark_catch_returns_default(); }\n');
  const result = audit(root, ['--update-baseline']);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /catch_returns_default.*1 to 2/);
  assert.equal(
    fs.readFileSync(baselineFile(root, 'catch_returns_default'), ENCODING), before);
});

test('--update-baseline never writes a new site in place of a removed one', (t) => {
  const root = fixture(t);
  assert.equal(audit(root, ['--update-baseline']).status, 0);
  // One owner-port site goes and another appears: the count is unchanged.
  write(root, 'src/alpha.js', ALPHA_SOURCE.replace(
    '  mark_owner_port_feature_detection();\n}', '}'));
  write(root, 'src/gamma.js', 'function grow() { mark_owner_port_feature_detection(); }\n');
  const result = audit(root, ['--update-baseline']);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr,
    /1 navigability owner_port_feature_detection site\(s\) the baseline does not allow/);
  const baseline = readBaseline(root, 'owner_port_feature_detection');
  assert.equal(baseline.rawViolationCount, 1);
  assert.ok(baseline.violations.every((v) => v.filePath !== 'src/gamma.js'));
  const check = audit(root, []);
  assert.equal(check.status, 1, check.stdout);
  assert.match(check.stdout, /src\/gamma\.js:\d+ grow owner_port_feature_detection/);
});

test('--pattern limits scanning and baseline writes to one row', (t) => {
  const root = fixture(t);
  const report = auditJson(root, ['--pattern', 'catch_returns_default']);
  assert.deepEqual(report.violations.map((v) => v.kind), ['catch_returns_default']);
  assert.deepEqual(report.patternCounts.map((entry) => entry.pattern),
    ['catch_returns_default']);
  const update = audit(root, ['--update-baseline', '--pattern', 'catch_returns_default']);
  assert.equal(update.status, 0, update.stderr);
  assert.deepEqual(update.calls, ['detectCatchReturnsDefault']);
  assert.deepEqual(fs.readdirSync(path.join(root, BASELINE_DIRECTORY)),
    ['check-guideline-navigability-baseline-catch_returns_default.json']);
  const unknown = audit(root, ['--pattern', 'not_a_row']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /not_a_row/);
});

test('a pattern promoted to ESLint is skipped; an unpromoted one is audited', (t) => {
  const root = fixture(t);
  const promoted = ['owner_port_feature_detection'];
  const result = audit(root, ['--update-baseline'], promoted);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Promoted to ESLint.*owner_port_feature_detection/);
  assert.ok(!result.calls.includes('detectOwnerPortFeatureDetection'), result.calls);
  assert.ok(result.calls.includes('detectCatchReturnsDefault'), result.calls);
  assert.equal(fs.existsSync(baselineFile(root, 'owner_port_feature_detection')), false);
  assert.equal(readBaseline(root, 'catch_returns_default').rawViolationCount, 1);
  // Growth of the promoted pattern is ESLint's to fail, not the audit's; growth
  // of an unpromoted pattern still fails here.
  write(root, 'src/gamma.js', 'function grow() { mark_owner_port_feature_detection(); }\n');
  const report = auditJson(root, [], promoted);
  assert.equal(report.totalViolationCount, 0);
  assert.ok(report.patternCounts.every((entry) =>
    entry.pattern !== 'owner_port_feature_detection'));
  write(root, 'src/delta.js', 'function grow() { mark_catch_returns_default(); }\n');
  const grown = audit(root, [], promoted);
  assert.equal(grown.status, 1, grown.stdout);
  assert.match(grown.stdout, /src\/delta\.js:1 grow catch_returns_default/);
  // Unpromoted, the same pattern is audited again and has no baseline.
  const unpromoted = auditJson(root);
  assert.ok(unpromoted.violations.some((v) =>
    v.kind === 'owner_port_feature_detection'));
});

test('explicit in-domain paths are scanned and out-of-domain paths dropped', (t) => {
  const root = fixture(t);
  const report = auditJson(root, ['src/alpha.js', 'docs/outside.js']);
  assert.equal(report.scannedFileCount, 1);
  assert.deepEqual([...new Set(report.violations.map((v) => v.filePath))], ['src/alpha.js']);
  // The extends chain is resolved over the whole domain, then reported only
  // for the scanned files.
  const beta = auditJson(root, ['src/beta.js']);
  assert.deepEqual(beta.violations.map((v) => v.kind), ['inheritance_depth_over_two']);
});

test('--json reports the shared baseline shape plus per-pattern counts', (t) => {
  const root = fixture(t);
  assert.equal(audit(root, ['--update-baseline']).status, 0);
  const report = auditJson(root);
  assert.deepEqual(Object.keys(report).sort(), [
    'baselineViolationCount', 'filesWithViolations', 'inheritedViolationCount',
    'patternCounts', 'rawViolationCount', 'scannedFileCount',
    'totalViolationCount', 'violations',
  ]);
  assert.equal(report.scannedFileCount, 2);
  assert.equal(report.rawViolationCount, 4);
  assert.equal(report.baselineViolationCount, 4);
  assert.equal(report.totalViolationCount, 0);
  assert.equal(report.patternCounts.length, ALL_ROWS.length);
  assert.deepEqual(
    report.patternCounts.find((entry) => entry.pattern === 'owner_port_feature_detection'),
    {pattern: 'owner_port_feature_detection', rawViolationCount: 2,
      baselineViolationCount: 2},
  );
});

test('the real audit over src reports only inherited violations',
  {timeout: 180_000}, () => {
    assert.ok(fs.existsSync(DETECTOR_MODULE),
      'scripts/checks/code-navigability-detectors.js is required for the real audit');
    const baselineExists = (row) => fs.existsSync(path.join(
      REPO_ROOT, 'scripts', `check-guideline-navigability-baseline-${row}.json`));
    // A row promoted to ESLint is gated there and keeps no baseline file
    // (docs/development/code-style.md); every other row keeps one.
    const promoted = promotedPatterns(REPO_ROOT, defaultEslintRunner, 'src/index.js', ALL_ROWS);
    const missing = ALL_ROWS.filter((row) => !promoted.has(row) && !baselineExists(row));
    assert.deepEqual(missing, [],
      'generate the baselines: node scripts/check-guideline-navigability.js ' +
      '--update-baseline');
    assert.deepEqual(ALL_ROWS.filter((row) => promoted.has(row) && baselineExists(row)), [],
      'delete the baseline file of a row promoted to ESLint');
    const result = spawnSync(process.execPath, [AUDIT_SCRIPT], {
      cwd: REPO_ROOT, encoding: ENCODING, timeout: INTEGRATION_TIMEOUT_MS,
    });
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Found 0 navigability violations/);
    assert.match(result.stdout, /Matched \d+ inherited navigability baseline violations/);
  });
