/**
 * Witness for Quest state-read-named-defaults (epic code-navigability-and-
 * mistake-resistance, row state_read_defaults).
 *
 * 1. No state read under src carries a `||`/`??` default: the one detector
 *    for the row (scripts/checks/code-navigability-detectors.js, R01, R05)
 *    reports zero sites and parses every file.
 * 2. The ESLint promotion of the row in eslint.config.js reports exactly the
 *    sites the detector counts, one report per site, on every shape the
 *    detector's fixture counts (plain, string-literal key, template key,
 *    constants member, optional chain; head, middle and tail-minus-one of a
 *    chain; `||` and `??`; explicit right-nested parentheses up to the
 *    promoted rule's stated nesting bound; a state-read branch of a
 *    conditional whose test reads a state field), and nothing on the shapes
 *    it does not count. Beyond the nesting bound the detector still counts
 *    and the rule is silent: the bound is stated, not hidden.
 *
 * DETECTOR_MODULE names the in-tree detector module once (one path, R11):
 * the witness and the budget row read the same detector.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {ESLint} from 'eslint';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DETECTOR_MODULE = new URL('../../scripts/checks/code-navigability-detectors.js',
  import.meta.url).href;
const ROW = 'state_read_defaults';
const MARKER = /navigability-rule:state_read_defaults(?![A-Za-z0-9_])/u;
const RESTRICTED_SYNTAX_RULE = 'no-restricted-syntax';
const FIXTURE_FILE = 'src/state-read-defaults-fixture.js';

const STATE_READS = [
  'row.status',
  'row.role',
  'row.raft_role',
  'row.raftRole',
  'row.workflow_step',
  'row.workflowStep',
  'row.phase',
  'row.step',
  'row[\'status\']',
  'row[`phase`]',
  'row[COLUMN.STATUS]',
  'row[FIELD.RAFT_ROLE]',
  'row[COLUMN.WORKFLOW_STEP]',
  'row[FIELD.ROLE]',
  'row[STAGE.PHASE]',
  'row[STAGE.STEP]',
  'row?.status',
  'row?.meta.workflowStep',
  'row?.[COLUMN.STATUS]',
];
// One expression per line; `S` stands for the state read and is the only
// counted term.
const COUNTED_SHAPES = [
  'S OP b OP c',
  'a OP S OP c',
  'a OP S OP c OP d',
  'a OP b OP S OP d',
  '(x OP (a OP S)) OP d',
  '(x OP (y OP (a OP S))) OP d',
  '(x OP (y OP (z OP (w OP (a OP S))))) OP d',
  // At the promoted rule's nesting bound (STATE_READ_DEFAULT_RIGHT_NESTING,
  // eslint.config.js): six parenthesised chains between the read and the
  // `.left` of the chain that continues.
  '(x1 OP (x2 OP (x3 OP (x4 OP (x5 OP (x6 OP (a OP S))))))) OP d',
  'x OP (S OP d)',
];
const BEYOND_NESTING_BOUND_SHAPE =
  '(x0 OP (x1 OP (x2 OP (x3 OP (x4 OP (x5 OP (x6 OP (a OP S)))))))) OP d';
// A conditional that decides on a state read inline: `@T` is the test's
// read (not counted), `@S` the counted branch; both are the same read.
const COUNTED_TERNARY_SHAPES = [
  'typeof @T === \'string\' ? @S : null',
  'typeof @T === \'string\' && @T.length > 0 ? @S : null',
  '@T === undefined ? null : @S',
  'isStated(@T) ? @S : fallback',
  '@T ? @S : 0',
];
const UNCOUNTED_TERNARY_SHAPES = [
  'x ? @S : null',
  'typeof @T === \'string\' ? x : null',
  '@T ? 1 : 2',
];
const UNCOUNTED_SHAPES = [
  'a OP b OP S',
  'x OP (a OP S)',
  'S && d',
  'a && S',
];
const UNCOUNTED_SOURCES = [
  'const n1 = row.state || \'idle\';',
  'const n2 = row[STATUS] || 1;',
  'const n3 = (x || row.status) ?? d;',
  'const n4 = (x ?? row.status) || d;',
  'const n5 = row.statusCode || row.statuses || d;',
];

function fixtureSource(shapes) {
  const lines = [];
  let index = 0;
  for (const shape of shapes) {
    for (const op of ['||', '??']) {
      for (const read of STATE_READS) {
        const expression = shape.replace(/OP/g, op).replace('S', read);
        lines.push(`const v${index} = ${expression};`);
        index += 1;
      }
    }
  }
  return lines;
}

function ternaryLines(shapes) {
  const lines = [];
  const expected = [];
  for (const shape of shapes) {
    for (const read of STATE_READS) {
      const withTest = shape.replaceAll('@T', read);
      const column = withTest.indexOf('@S');
      const line = `const t${lines.length} = ${withTest.replace('@S', read)};`;
      expected.push(`${lines.length + 1}:${column + `const t${lines.length} = `.length}`);
      lines.push(line);
    }
  }
  return {lines, expected};
}

async function eslintStateReports(source) {
  const eslint = new ESLint({cwd: REPO_ROOT});
  const [result] = await eslint.lintText(source, {filePath: path.join(REPO_ROOT, FIXTURE_FILE)});
  assert.deepEqual(result.messages.filter((message) => message.fatal), [],
    'the fixture parses');
  return result.messages
    .filter((message) => message.ruleId === RESTRICTED_SYNTAX_RULE && MARKER.test(message.message))
    .map((message) => {
      assert.equal(message.severity, 2, 'the promoted row is an error');
      return `${message.line}:${message.column - 1}`;
    });
}

async function detectorSites(source) {
  const detectors = await import(DETECTOR_MODULE);
  const parsed = detectors.parseNavigabilitySource(source, FIXTURE_FILE);
  return detectors.detectStateReadDefaults(parsed)
    .map((site) => `${site.loc.start.line}:${site.loc.start.column}`);
}

test('no state read under src carries a || or ?? default', async () => {
  const detectors = await import(DETECTOR_MODULE);
  const {sites, parseFailures} = detectors.detectNavigabilityPatterns(REPO_ROOT);
  assert.deepEqual(parseFailures, [], 'every src file parsed, so the count is complete');
  const remaining = sites.filter((site) => site.row === ROW)
    .map((site) => `${site.file}:${site.loc.start.line}:${site.loc.start.column} ${site.detail}`);
  assert.deepEqual(remaining, []);
});

test('the ESLint promotion reports one error per detector site, every shape', async () => {
  const counted = fixtureSource(COUNTED_SHAPES);
  const source = counted.join('\n') + '\n';
  const expected = counted.map((line, index) =>
    `${index + 1}:${line.indexOf('row')}`);
  assert.deepEqual(await detectorSites(source), expected,
    'the detector counts the state read of every counted shape');
  assert.deepEqual(await eslintStateReports(source), expected,
    'ESLint reports exactly the detector sites');
});

test('the ESLint promotion reports each state-read branch of a deciding conditional', async () => {
  const {lines, expected} = ternaryLines(COUNTED_TERNARY_SHAPES);
  const source = lines.join('\n') + '\n';
  assert.deepEqual(await detectorSites(source), expected,
    'the detector counts the state-read branch of every counted conditional');
  assert.deepEqual(await eslintStateReports(source), expected,
    'ESLint reports exactly the detector sites');
});

test('the ESLint promotion is silent where the detector counts nothing', async () => {
  const source = [...fixtureSource(UNCOUNTED_SHAPES), ...UNCOUNTED_SOURCES,
    ...ternaryLines(UNCOUNTED_TERNARY_SHAPES).lines].join('\n') + '\n';
  assert.deepEqual(await detectorSites(source), []);
  assert.deepEqual(await eslintStateReports(source), []);
});

test('beyond the stated nesting bound the detector counts and the rule is silent', async () => {
  const lines = fixtureSource([BEYOND_NESTING_BOUND_SHAPE]);
  const source = lines.join('\n') + '\n';
  assert.equal((await detectorSites(source)).length, lines.length);
  assert.deepEqual(await eslintStateReports(source), [],
    'raise STATE_READ_DEFAULT_RIGHT_NESTING in eslint.config.js with this shape');
});
