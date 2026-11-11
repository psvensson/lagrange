/**
 * The constant-member existence audit rejects a read of a member that does
 * not exist on a closed constants object, and judges nothing it cannot prove
 * closed. The fixture is a real module tree on disk: the audit loads the
 * constants module and reads its true members.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {test} from '../../src/test-helpers/tap.js';
import {
  UNEXAMINED_BASELINE_FILE,
  UNCHECKED_REASON,
  VIOLATION_KIND,
  auditConstantMemberExistence,
  formatViolation,
} from '../../scripts/checks/check-constant-member-existence.js';

const CHECKER_PATH = fileURLToPath(new URL(
  '../../scripts/checks/check-constant-member-existence.js', import.meta.url));
const FIXTURE_PREFIX = 'constant-member-existence-';
const FIXTURE_ROOT = 'src';
const MODULE_PACKAGE = JSON.stringify({type: 'module'});

const CONSTANTS_MODULE = [
  'const FIELD = Object.freeze({',
  '  NODE_ID: \'nodeId\',',
  '  NESTED: Object.freeze({INNER: \'inner\'}),',
  '  describe: (value) => `field ${value}`,',
  '});',
  'const SHARED = Object.freeze({FIELD, helper: () => 1});',
  'const UNFROZEN_BUNDLE = {PRESENT: 1};',
  'const NAMES = Object.freeze([\'a\']);',
  'export {FIELD, NAMES, SHARED, UNFROZEN_BUNDLE};',
  '',
].join('\n');

const CLEAN_MODULE = [
  'import {FIELD, NAMES, SHARED, UNFROZEN_BUNDLE} from \'./constants.js\';',
  'import * as constants from \'./constants.js\';',
  'const {FIELD: SHARED_FIELD, helper} = SHARED;',
  'const LOCAL = Object.freeze({READY: \'ready\', ...FIELD});',
  'const objectFreeze = Object.freeze;',
  'const CAPTURED = objectFreeze({DONE: \'done\'});',
  'const registry = {};',
  'registry.late = 1;',
  'export function read(record, FIELD_PARAMETER) {',
  '  return [',
  '    record[FIELD.NODE_ID], FIELD.NESTED.INNER, FIELD.describe(1),',
  '    SHARED_FIELD.NODE_ID, helper(), LOCAL.READY, LOCAL.NODE_ID,',
  '    CAPTURED.DONE, constants.FIELD, UNFROZEN_BUNDLE.PRESENT,',
  '    NAMES.length, FIELD.toString(), registry.late, registry.absent,',
  '    FIELD_PARAMETER.ANYTHING,',
  '  ];',
  '}',
  '',
].join('\n');

// Every line that must be rejected carries its expected member.
const BAD_MODULE = [
  'import {FIELD, SHARED, UNFROZEN_BUNDLE} from \'./constants.js\';',
  'import * as constants from \'./constants.js\';',
  'const {FIELD: SHARED_FIELD, missingHelper} = SHARED;',
  'const {withDefault = 1} = SHARED;',
  'const LOCAL = Object.freeze({READY: \'ready\'});',
  'const objectFreeze = Object.freeze;',
  'const CAPTURED = objectFreeze({DONE: \'done\'});',
  'export function read(record) {',
  '  const options = {[FIELD.SERVICE_ID]: true};',
  '  return [',
  '    options, missingHelper, withDefault,',
  '    record[FIELD.TENANT_ID],',
  '    FIELD.NESTED.OUTER,',
  '    FIELD.describeAll(1),',
  '    FIELD?.OPTIONAL || \'local default\',',
  '    FIELD[\'QUOTED\'],',
  '    SHARED_FIELD.ALIASED,',
  '    LOCAL.PENDING,',
  '    CAPTURED.FAILED,',
  '    constants.ABSENT_EXPORT,',
  '    UNFROZEN_BUNDLE.ABSENT,',
  '  ];',
  '}',
  '',
].join('\n');

const EXPECTED_BAD_MEMBERS = Object.freeze([
  'missingHelper', 'SERVICE_ID', 'TENANT_ID', 'OUTER', 'describeAll',
  'OPTIONAL', 'QUOTED', 'ALIASED', 'PENDING', 'FAILED', 'ABSENT_EXPORT',
  'ABSENT',
]);

function writeBaseline(directory, unexaminedByReason) {
  const baselinePath = path.join(directory, UNEXAMINED_BASELINE_FILE);
  fs.mkdirSync(path.dirname(baselinePath), {recursive: true});
  fs.writeFileSync(baselinePath,
    JSON.stringify({version: 1, unexaminedByReason}));
}

// The clean tree's unexamined reads: a frozen array and a parameter named
// like no exported constant.
const CLEAN_UNEXAMINED = Object.freeze({
  [UNCHECKED_REASON.NOT_AN_OBJECT]: 1,
  [UNCHECKED_REASON.INJECTED_UNKNOWN_NAME]: 1,
});

function writeFixture(t, files, unexaminedByReason = CLEAN_UNEXAMINED) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX));
  t.teardown(() => fs.rmSync(directory, {recursive: true, force: true}));
  if (unexaminedByReason !== null) writeBaseline(directory, unexaminedByReason);
  fs.writeFileSync(path.join(directory, 'package.json'), MODULE_PACKAGE);
  fs.mkdirSync(path.join(directory, FIXTURE_ROOT));
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, FIXTURE_ROOT, name), text);
  }
  return directory;
}

function audit(directory) {
  return auditConstantMemberExistence({
    repoRoot: directory, roots: [FIXTURE_ROOT],
  });
}

test('reads of existing members on closed constants objects pass', async (t) => {
  const directory = writeFixture(t, {
    'constants.js': CONSTANTS_MODULE,
    'reader.js': CLEAN_MODULE,
  });

  const result = await audit(directory);

  t.same(result.violations, []);
  t.same(result.loadFailures, []);
  t.same(result.parseFailures, []);
  t.equal(result.stats.fileCount, 2);
  t.ok(result.stats.checkedReads >= 12, 'the clean reads were examined');
  t.same(result.stats.uncheckedByReason, CLEAN_UNEXAMINED,
    'a parameter named like no exported constant is counted as unexamined');
  t.same(result.uncheckedReads, [
    {file: 'src/reader.js', line: 14, base: 'NAMES',
      reason: UNCHECKED_REASON.NOT_AN_OBJECT},
    {file: 'src/reader.js', line: 15, base: 'FIELD_PARAMETER',
      reason: UNCHECKED_REASON.INJECTED_UNKNOWN_NAME},
  ], 'every unexamined read is listed by site');
});

test('every read of a missing member is rejected, by site', async (t) => {
  const directory = writeFixture(t, {
    'constants.js': CONSTANTS_MODULE,
    'reader.js': BAD_MODULE,
  });

  const result = await audit(directory);

  t.same(
    result.violations.map((violation) => violation.member),
    EXPECTED_BAD_MEMBERS,
  );
  t.same(result.loadFailures, []);
  const destructure = result.violations[0];
  t.equal(destructure.kind, VIOLATION_KIND.DESTRUCTURE);
  t.equal(destructure.base, 'SHARED');
  t.equal(destructure.file, 'src/reader.js');
  t.equal(destructure.line, 3);
  const keyRead = result.violations[1];
  t.equal(keyRead.kind, VIOLATION_KIND.MEMBER_READ);
  t.equal(keyRead.base, 'FIELD');
  t.equal(keyRead.line, 9);
  t.match(formatViolation(keyRead), /src\/reader\.js:9:\d+ FIELD\.SERVICE_ID/);
  t.notOk(
    result.violations.some((violation) => violation.member === 'withDefault'),
    'a destructure with a default states its own absent case');
});

test('a module that cannot be loaded fails the audit', async (t) => {
  const directory = writeFixture(t, {
    'constants.js': 'throw new Error(\'constants module broke\');\n',
    'reader.js':
      'import {FIELD} from \'./constants.js\';\nexport const id = FIELD.ID;\n',
  });

  const result = await audit(directory);

  t.same(result.violations, []);
  t.equal(result.loadFailures.length, 1);
  t.equal(result.loadFailures[0].file, 'src/constants.js');
  t.match(result.loadFailures[0].error, /constants module broke/);
});

test('the command exits non-zero on the known-bad tree and zero on the clean one',
  async (t) => {
    const bad = writeFixture(t, {
      'constants.js': CONSTANTS_MODULE,
      'reader.js': BAD_MODULE,
    });
    const clean = writeFixture(t, {
      'constants.js': CONSTANTS_MODULE,
      'reader.js': CLEAN_MODULE,
    });
    const unloadable = writeFixture(t, {
      'constants.js': 'throw new Error(\'constants module broke\');\n',
      'reader.js':
        'import {FIELD} from \'./constants.js\';\nexport const id = FIELD.ID;\n',
    });
    const run = (cwd) => spawnSync(process.execPath, [CHECKER_PATH],
      {cwd, encoding: 'utf8'});

    const badRun = run(bad);
    t.equal(badRun.status, 1);
    t.match(badRun.stderr, /src\/reader\.js:12:\d+ FIELD\.TENANT_ID: no such member/);
    t.match(badRun.stderr, /\(12\)/);

    const cleanRun = run(clean);
    t.equal(cleanRun.status, 0, cleanRun.stderr);
    t.match(cleanRun.stdout, /constant-member existence: ok/);

    const unloadableRun = run(unloadable);
    t.equal(unloadableRun.status, 1);
    t.match(unloadableRun.stderr, /could not be loaded/);
  });

// --- injected bags, nested destructures, template members, class statics --

const BAG_CONSTANTS_MODULE = [
  'const FIELD = Object.freeze({',
  '  NODE_ID: \'nodeId\',',
  '  NESTED: Object.freeze({INNER: \'inner\'}),',
  '});',
  'const SHARED = Object.freeze({FIELD});',
  'class Registry {',
  '  static KNOWN = 1;',
  '}',
  'const DUPLICATE = Object.freeze({ONE: 1});',
  'export {DUPLICATE, FIELD, Registry, SHARED};',
  '',
].join('\n');

// Every line that must be rejected carries its expected member.
const BAG_READER_MODULE = [
  'import {Registry, SHARED} from \'./bag-constants.js\';',
  'const {FIELD: {NESTED: {INNER, MISSING_INNER}}} = SHARED;',
  'const {FIELD: {NESTED: NESTED_ALIAS}} = SHARED;',
  'export class LocalClass {',
  '  static PRESENT = 1;',
  '}',
  'export function fromOptions(options = {}) {',
  '  const {FIELD} = options;',
  '  return [FIELD.NODE_ID, FIELD.NESTED.INNER, FIELD.ABSENT_IN_BAG];',
  '}',
  'export function fromParameter(FIELD, {SHARED: {FIELD: SHARED_FIELD}}) {',
  '  return [FIELD.NODE_ID, FIELD.PARAMETER_ABSENT, SHARED_FIELD.NESTED,',
  '    SHARED_FIELD.SHARED_ABSENT];',
  '}',
  'export function rest(DUPLICATE, UNKNOWN_BAG) {',
  '  const {NESTED} = SHARED.FIELD;',
  '  return [INNER, MISSING_INNER, NESTED_ALIAS.ALIAS_ABSENT, NESTED,',
  '    SHARED.FIELD[`NODE_ID`], SHARED.FIELD[`TEMPLATE_ABSENT`],',
  '    Registry.KNOWN, Registry.name, Registry.STATIC_ABSENT,',
  '    LocalClass.PRESENT, LocalClass.LOCAL_STATIC_ABSENT,',
  '    DUPLICATE.ONE, UNKNOWN_BAG.ANYTHING];',
  '}',
  '',
].join('\n');

const EXPECTED_BAG_MEMBERS = Object.freeze([
  'MISSING_INNER', 'ALIAS_ABSENT', 'TEMPLATE_ABSENT', 'STATIC_ABSENT',
  'LOCAL_STATIC_ABSENT', 'ABSENT_IN_BAG', 'PARAMETER_ABSENT', 'SHARED_ABSENT',
]);

test('injected bags, nested destructures, template members and class ' +
  'statics are judged', async (t) => {
  const directory = writeFixture(t, {
    'bag-constants.js': BAG_CONSTANTS_MODULE,
    'other-constants.js': 'export const DUPLICATE = Object.freeze({TWO: 2});\n',
    'reader.js': BAG_READER_MODULE,
    // Loads reader.js, so its own exported class is judged by its statics.
    'consumer.js': 'import {LocalClass} from \'./reader.js\';\n' +
      'export {DUPLICATE} from \'./other-constants.js\';\n' +
      'export const present = LocalClass.PRESENT;\n',
  });

  const result = await audit(directory);

  t.same(result.loadFailures, []);
  t.same(result.parseFailures, []);
  t.same(result.violations.map((violation) => violation.member),
    EXPECTED_BAG_MEMBERS);
  const injected = result.violations.filter(
    (violation) => violation.kind === VIOLATION_KIND.INJECTED);
  t.same(injected.map((violation) => `${violation.base}:${violation.line}`),
    ['FIELD:9', 'FIELD:12', 'SHARED_FIELD:13']);
  t.same(result.stats.uncheckedByReason, {
    [UNCHECKED_REASON.INJECTED_AMBIGUOUS_NAME]: 1,
    [UNCHECKED_REASON.INJECTED_UNKNOWN_NAME]: 1,
  }, 'a bag name two modules export, or none, is unexamined, not judged');
});

test('the unexamined count is ratcheted one-way against its baseline',
  async (t) => {
    const run = (cwd) => spawnSync(process.execPath, [CHECKER_PATH],
      {cwd, encoding: 'utf8'});
    const files = {'constants.js': CONSTANTS_MODULE, 'reader.js': CLEAN_MODULE};

    const atBaseline = run(writeFixture(t, files));
    t.equal(atBaseline.status, 0, atBaseline.stderr);
    t.match(atBaseline.stdout, /2 constant-looking reads unexamined/);
    t.notMatch(atBaseline.stdout, /can be tightened/);

    const above = run(writeFixture(t, files,
      {[UNCHECKED_REASON.NOT_AN_OBJECT]: 1}));
    t.equal(above.status, 1, 'one more unexamined read than the baseline fails');
    t.match(above.stderr,
      /injected_bag_name_not_an_exported_constant: 1 unexamined reads exceed the one-way baseline of 0/);

    const below = run(writeFixture(t, files, {...CLEAN_UNEXAMINED,
      [UNCHECKED_REASON.INJECTED_UNKNOWN_NAME]: 3}));
    t.equal(below.status, 0, below.stderr);
    t.match(below.stdout,
      /can be tightened .*injected_bag_name_not_an_exported_constant from 3 to 1/);

    const missing = run(writeFixture(t, files, null));
    t.equal(missing.status, 1, 'a missing baseline is refused, not unlimited');
    t.match(missing.stderr, /refuses to run without a baseline/);
  });
