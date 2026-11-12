/**
 * Property test for Test Configuration Compliance.
 *
 * Property 9: For any property test file using fast-check, the numRuns
 * configuration SHALL be set to 10, and for any unit test, execution
 * time SHALL be under 2 seconds.
 *
 * **Validates: Requirements 11.1, 11.2**
 *
 * **Feature: test-failure-fixes, Property 9: Test Configuration Compliance**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {findSkippedTests} from '../../scripts/checks/test-skip-policy.js';
import {PERMISSION_WITNESS_UNAVAILABLE} from '../test-helpers/permission-witness.js';

/**
 * Get all property test files in the test directory.
 * @return {string[]} Array of file paths
 */
function getPropertyTestFiles() {
  const testDir = path.resolve(process.cwd(), 'test');
  const files = [];

  function walkDir(dir) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.property.test.js')) {
        files.push(fullPath);
      }
    }
  }

  walkDir(testDir);
  return files;
}

/**
 * Check if a file contains fc.assert with numRuns configuration.
 * @param {string} content - File content
 * @return {Object} Analysis result
 */
function analyzeNumRunsConfig(content) {
  const fcAssertMatches = content.match(/fc\.assert\s*\([^)]+\)/g) || [];
  const results = [];

  for (const match of fcAssertMatches) {
    // Check if numRuns is specified
    const hasNumRuns = match.includes('numRuns');
    const numRunsMatch = match.match(/numRuns:\s*(\d+|NUM\.TEN)/);

    if (hasNumRuns && numRunsMatch) {
      const value = numRunsMatch[1];
      const isCompliant = value === '10' || value === 'NUM.TEN';
      results.push({match, hasNumRuns, value, isCompliant});
    } else if (!hasNumRuns) {
      // fc.assert without numRuns - check if it's in the options object
      results.push({match, hasNumRuns: false, value: null, isCompliant: false});
    }
  }

  return results;
}

/**
 * Feature: test-failure-fixes
 * Property 9: Test Configuration Compliance
 *
 * For any property test file using fast-check, the numRuns configuration
 * SHALL be set to 10.
 */
test('Property 9: Test Configuration Compliance', async (t) => {
  /**
   * Property: All property test files have numRuns set to 10.
   *
   * For any property test file, all fc.assert calls SHALL have
   * numRuns configured to 10 (or NUM.TEN constant).
   *
   * **Validates: Requirements 11.1, 11.2**
   */
  t.test('all property test files have numRuns set to 10', async (t) => {
    const propertyTestFiles = getPropertyTestFiles();

    t.ok(propertyTestFiles.length > 0, 'should find property test files');

    let totalAsserts = 0;
    const nonCompliantFiles = [];

    for (const filePath of propertyTestFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const results = analyzeNumRunsConfig(content);

      for (const result of results) {
        totalAsserts++;
        if (result.isCompliant) {
          continue;
        } else if (result.hasNumRuns) {
          nonCompliantFiles.push({
            file: path.relative(process.cwd(), filePath),
            value: result.value,
          });
        }
      }
    }

    t.ok(totalAsserts > 0, `should find fc.assert calls (found ${totalAsserts})`);

    if (nonCompliantFiles.length > 0) {
      t.comment('Non-compliant files:');
      for (const {file, value} of nonCompliantFiles) {
        t.comment(`  ${file}: numRuns=${value}`);
      }
    }

    t.equal(
      nonCompliantFiles.length,
      0,
      `all fc.assert calls should have numRuns: 10 (found ${nonCompliantFiles.length} non-compliant)`,
    );
  });

  /**
   * Property: Property test files use fast-check correctly.
   *
   * For any property test file, the file SHALL import fast-check
   * and use fc.assert or fc.property.
   *
   * **Validates: Requirements 11.1**
   */
  t.test('property test files use fast-check correctly', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...getPropertyTestFiles().slice(0, 10)),
        (filePath) => {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Check for fast-check import
          const hasFastCheckImport = content.includes('from \'fast-check\'') ||
                                     content.includes('from "fast-check"');

          // Check for fc.assert or fc.property usage
          const usesFastCheck = content.includes('fc.assert') ||
                               content.includes('fc.property');

          return hasFastCheckImport && usesFastCheck;
        },
      ),
      {numRuns: 10},
    );

    t.pass('property test files use fast-check correctly');
  });

  /**
   * Property: No skipped tests in test files.
   *
   * For any test file, there SHALL be no skipped test option or framework-bound skip call.
   *
   * **Validates: Requirements 11.4**
   */
  t.test('no skipped tests in test files', async (t) => {
    const testDir = path.resolve(process.cwd(), 'test');
    const testFiles = [];

    function walkDir(dir) {
      const entries = fs.readdirSync(dir, {withFileTypes: true});
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.name.endsWith('.js')) {
          testFiles.push(fullPath);
        }
      }
    }

    walkDir(testDir);

    const filesWithSkips = [];
    for (const filePath of testFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const violation of findSkippedTests(content, filePath)) {
        filesWithSkips.push({
          file: path.relative(process.cwd(), filePath),
          pattern: `${violation.line}:${violation.column} ${violation.message}`,
        });
      }
    }

    if (filesWithSkips.length > 0) {
      t.comment('Files with skipped tests:');
      for (const {file, pattern} of filesWithSkips) {
        t.comment(`  ${file}: ${pattern}`);
      }
    }

    t.equal(
      filesWithSkips.length,
      0,
      `no test files should have skipped tests (found ${filesWithSkips.length})`,
    );
  });
});

// Executable source snippets are data for the checker, never registered tests.
test('skip policy follows framework bindings and excludes unrelated calls', async (t) => {
  const rejected = [
    'import {it} from \'node:test\'; it(\'permission\', {skip: false}, () => {});',
    'import {test as check} from \'node:test\'; check(\'permission\', {skip: true}, () => {});',
    'import * as checks from \'node:test\'; checks.it(\'permission\', {skip: true}, () => {});',
    'import tap from \'tap\'; tap.test(\'permission\', {skip: true}, () => {});',
    'import {test} from \'../../src/test-helpers/tap.js\'; ' +
      'test(\'parent\', (context) => context.test(\'permission\', {skip: true}, () => {}));',
    'import check from \'node:test\'; check(\'permission\', {\'skip\': false}, () => {});',
    'import {it as check} from \'node:test\'; check.skip(\'permission\', () => {});',
    'import {describe as group} from \'node:test\'; group.skip(\'permission\', () => {});',
    'import {suite as group} from \'node:test\'; group(\'permission\', {skip: true}, () => {});',
    'import {test} from \'node:test\'; const check = test; ' +
      'check(\'permission\', {[\'skip\']: false}, () => {});',
    'import * as checks from \'node:test\'; const {it: check} = checks; ' +
      'check[\'skip\'](\'permission\', () => {});',
    'import {test} from \'node:test\'; const options = {skip: false}; ' +
      'test(\'permission\', {...options}, () => {});',
    'import {test} from \'node:test\'; test(\'permission\', (context) => context.skip());',
    'import {test} from \'node:test\'; test(\'parent\', (context) => ' +
      'context.test(\'child\', (child) => child.skip()));',
    'import tap from \'../../src/test-helpers/tap.js\'; ' +
      'tap.test(\'parent\', (context) => context.skip(\'child\'));',
    'import * as tap from \'tap\'; tap.test(\'permission\', {skip: true}, () => {});',
    'import {skip as omit} from \'tap\'; omit(\'permission\', () => {});',
    'import {test} from \'node:test\'; test(\'parent\', (context) => { ' +
      'const {skip: omit} = context; omit(); });',
    '/* eslint-disable */ import {it} from \'node:test\'; ' +
      'it(\'permission\', {skip: true}, () => {});',
    'import {test} from \'node:test\'; test(\'permission\', {"sk\\u0069p": false}, () => {});',
    'import {t} from \'tap\'; t.skip(\'permission\');',
    'import {t as root} from \'tap\'; root.test(\'permission\', {skip: false}, () => {});',
    'import * as tap from \'tap\'; tap.t.skip(\'permission\');',
    'import {it} from \'node:test\'; const key = \'skip\'; ' +
      'it(\'permission\', {[key]: false}, () => {});',
    'import {test} from \'node:test\'; const key = \'skip\'; test[key](\'permission\');',
    'import {test} from \'node:test\'; test[`skip`](\'permission\');',
    'import {test} from \'node:test\'; const {options} = {options: {skip: false}}; ' +
      'test(\'permission\', options, () => {});',
    'import {test} from \'node:test\'; const {outer: {options}} = ' +
      '{outer: {options: {skip: false}}}; test(\'permission\', options, () => {});',
    'import tap from \'tap\'; tap.test(\'parent\', async ({test}) => ' +
      'test(\'permission\', {skip: false}, () => {}));',
    'import tap from \'tap\'; tap.test(\'parent\', ({skip: omit}) => omit(\'permission\'));',
    'import {test} from \'node:test\'; test(\'parent\', ({test: child}) => ' +
      'child(\'permission\', {skip: false}, () => {}));',
  ];
  for (const source of rejected) {
    t.equal(findSkippedTests(source, fileURLToPath(import.meta.url)).length > 0, true, source);
  }
  const accepted = [
    'const test = () => {}; test(\'data\', {skip: true});',
    'const t = {test() {}}; t.test(\'data\', {skip: true});',
    'import {test} from \'some-other-library\'; test(\'data\', {skip: true});',
    'import {test} from \'node:test\'; ' +
      'function ordinary(test) { test(\'data\', {skip: true}); }',
    'import {it} from \'node:test\'; function ordinary(it) { it.skip(\'data\'); }',
    'import {test} from \'node:test\'; test(\'parent\', (context) => { ' +
      'function ordinary(context) { context.skip(\'data\'); } });',
    'import {test} from \'node:test\'; test(\'parent\', () => { ' +
      'const context = {test() {}}; context.test(\'data\', {skip: true}); });',
    'import {test} from \'node:test\'; const fixture = {skip: true}; ' +
      'test(\'data\', () => fixture);',
    '// test.skip(\'comment\')\nconst snippet = `it(\'data\', {skip: true})`;',
    'const xit = () => {}; xit(\'ordinary function\');',
    '/* eslint-disable no-extend-native */ const fixture = {skip: true};',
    'import {describe} from \'node:test\'; describe(\'suite\', (context) => ' +
      'context.test(\'not a Node TestContext\', {skip: true}));',
    'import {test} from \'node:test\'; { const test = () => {}; ' +
      'test(\'data\', {skip: true}); }',
    'import {test} from \'node:test\'; try {} catch (test) { ' +
      'test(\'data\', {skip: true}); }',
    'import tap from \'../unrelated/tap.js\'; tap.test(\'data\', {skip: true});',
    'import {test} from \'node:test\'; const {options} = {skip: true, options: {}}; ' +
      'test(\'runs\', options, () => {});',
    'import {test} from \'node:test\'; const {outer: {options}} = ' +
      '{outer: {skip: true, options: {}}}; test(\'runs\', options, () => {});',
    'import {test} from \'node:test\'; const key = \'other\'; ' +
      'test(\'runs\', {[key]: \'skip\'}, () => {});',
    'import {t} from \'tap\'; function ordinary(t) { t.skip(\'data\'); }',
    'import {describe} from \'node:test\'; describe(\'suite\', ({test}) => ' +
      'test(\'not a TestContext\', {skip: true}));',
  ];
  for (const source of accepted) {
    t.equal(findSkippedTests(source, fileURLToPath(import.meta.url)).length > 0, false, source);
  }
  t.throws(() => findSkippedTests('import {', fileURLToPath(import.meta.url)),
    /Unexpected token/, 'unparseable source cannot certify no skipped tests');
  const unresolved = findSkippedTests('import {test} from \'node:test\'; ' +
    'test(\'parent\', (context) => { context = other; context.skip(); });',
  fileURLToPath(import.meta.url));
  t.equal(unresolved.length, 1, 'mutable context cannot silently certify no skips');
  t.equal(unresolved[0].messageId, 'unresolved', 'unresolved is distinct from a proven skip');
  const mixed = findSkippedTests('import {it} from \'node:test\'; ' +
    '{ const it = () => {}; it(\'data\', {skip: true}); } ' +
    'it(\'permission\', {skip: true}, () => {});', fileURLToPath(import.meta.url));
  t.equal(mixed.length, 1, 'an inner shadow cannot hide the real outer violation');
});

test('skip policy preserves hook authority and object projection semantics', async (t) => {
  const filename = fileURLToPath(import.meta.url);
  const rejected = [
    'import tap from \'tap\'; tap.beforeEach(t => t.skip(\'permission\'));',
    'import {beforeEach as hook} from \'tap\'; hook(t => t.skip(\'permission\'));',
    'import * as tap from \'tap\'; tap.afterEach(t => t.skip(\'permission\'));',
    `import {t} from 'tap'; const {beforeEach: hook} = t;
      hook(({skip: omit}) => omit('permission'));`,
    `import {afterEach} from '../../src/test-helpers/tap.js';
      afterEach(t => t.skip('permission'));`,
    `import {test} from 'node:test'; test('parent', t => {
      t.before(child => child.skip(), {timeout: 100});
    });`,
    `import {test} from 'node:test'; test('parent', t => {
      const {afterEach: hook} = t; hook(({skip: omit}) => omit());
    });`,
    `import {test} from 'node:test'; const bag = {0: {skip: false}};
      const {['0']: options} = bag; test('permission', options, () => {});`,
    `import {test} from 'node:test'; const bag = {'0': {skip: false}};
      test('permission', bag[0], () => {});`,
    `import {test} from 'node:test'; const bag = {[null]: {skip: false}};
      test('permission', bag.null, () => {});`,
    `import {test} from 'node:test'; const {options} = {
      options: {skip: false}, ...{other: undefined}};
      test('permission', options, () => {});`,
    `import {test} from 'node:test'; const {options} = {
      options: {skip: false}, ...undefined, ...null};
      test('permission', options, () => {});`,
  ];
  for (const source of rejected) {
    t.equal(findSkippedTests(source, filename)[0]?.messageId, 'skip', source);
  }
  // Node's exported hooks can receive TestContext or SuiteContext. Preserve
  // that uncertainty instead of claiming a proven skip or certifying none.
  for (const hook of ['before', 'after', 'beforeEach', 'afterEach']) {
    const source = `import {${hook} as hook} from 'node:test';
      hook(context => context.skip(), {timeout: 100});`;
    t.equal(findSkippedTests(source, filename)[0]?.messageId, 'unresolved', source);
  }
  const accepted = [
    'import tap from \'tap\'; tap.before(t => t.skip(\'not a supplied context\'));',
    'import tap from \'tap\'; tap.after(t => t.skip(\'not a supplied context\'));',
    `import {beforeEach} from 'tap';
      function ordinary(beforeEach) { beforeEach(t => t.skip('data')); }`,
    'import {beforeEach} from \'some-other-library\'; beforeEach(t => t.skip(\'data\'));',
    'import {beforeEach} from \'node:test\'; beforeEach((context, done) => done.skip());',
    'import {beforeEach} from \'node:test\'; beforeEach(() => {}, {skip: false});',
    `import {test} from 'node:test'; const {options} = {
      options: {skip: true}, ...{options: undefined}};
      test('runs', {...options}, () => {});`,
    `import {test} from 'node:test'; const absent = undefined;
      const {options} = {options: {skip: true}, ...{options: absent}};
      test('runs', {...options}, () => {});`,
    `import {test} from 'node:test'; const {options} = {
      options: {skip: true}, ...{...{options: null}}};
      test('runs', {...options}, () => {});`,
    `import {test} from 'node:test'; const {options} = {
      options: {skip: true}, ...unknown}; test('runs', options, () => {});`,
  ];
  for (const source of accepted) {
    t.same(findSkippedTests(source, filename), [], source);
  }
});

test('skip policy projects literal spread properties with JavaScript enumerability', async (t) => {
  const filename = fileURLToPath(import.meta.url);
  for (const literal of ['false', 'true', '0', '1', '0n', '/literal/',
    '""', '"indices"', '`indices`', 'undefined', 'null']) {
    const source = `import {test} from 'node:test';
      const {options} = {options: {skip: false}, ...${literal}};
      test('permission', options, () => {});`;
    t.equal(findSkippedTests(source, filename)[0]?.messageId, 'skip', source);
  }
  const rejected = [
    `import {test} from 'node:test'; const empty = false;
      const {options} = {options: {skip: false}, ...empty};
      test('permission', options, () => {});`,
    `import {test} from 'node:test';
      const {length: options} = {length: {skip: false}, ...'indices'};
      test('permission', options, () => {});`,
    `import {test} from 'node:test'; const key = 'x'.length;
      const {[key]: options} = {1: {skip: false}};
      test('permission', options, () => {});`,
  ];
  for (const source of rejected) {
    t.equal(findSkippedTests(source, filename)[0]?.messageId, 'skip', source);
  }
  const source = `import {test} from 'node:test';
    const {0: options} = {0: {skip: false}, ...'x'};
    test('runs', {...options}, () => {});`;
  t.same(findSkippedTests(source, filename), [], 'string indices really overwrite earlier values');
});

test('permission prerequisite refuses unavailable identity with a typed failure', async (t) => {
  // Only identity is simulated here. The birth and prune tests separately
  // engage real filesystem EACCES under the actual runner principal.
  const helper = new URL('../test-helpers/permission-witness.js', import.meta.url).href;
  for (const [real, effective] of [
    ['() => 0', '() => 1000'], ['() => 1000', '() => 0'],
    ['undefined', '() => 1000'], ['() => 1000', 'undefined'],
  ]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      process.getuid = ${real};
      process.geteuid = ${effective};
      const {requirePermissionWitness} = await import(${JSON.stringify(helper)});
      try {
        requirePermissionWitness();
      } catch (error) {
        process.stderr.write(error.code + ': ' + error.message);
        process.exitCode = 1;
      }
    `], {encoding: 'utf8'});
    t.equal(child.error, undefined, 'the identity control executed');
    t.equal(child.status, 1, 'unsupported identity fails, never skips or succeeds');
    t.match(child.stderr, PERMISSION_WITNESS_UNAVAILABLE, 'typed infrastructure outcome');
    t.match(child.stderr, 'unprivileged POSIX', 'actionable execution prerequisite');
  }
});
