import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import tap from 'tap';

import {importClosureGaps} from '../../scripts/solve/import-closure.js';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-closure-'));
  fs.mkdirSync(path.join(root, 'src', 'owners'), {recursive: true});
  return root;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

tap.test('importClosureGaps', async (t) => {
  t.test('flags a candidate file importing a changed-but-omitted owner', (t) => {
    const root = setup();
    write(root, 'src/owners/consumer.js',
      'import {budget} from \'./result-budget-owner.js\';\nexport const x = budget;\n');
    write(root, 'src/owners/result-budget-owner.js', 'export const budget = 1;\n');
    const candidate = {
      baseCommit: 'deadbeef',
      paths: ['src/owners/consumer.js'],
    };
    const filterDescriptor = Reflect.getOwnPropertyDescriptor(
      Array.prototype, 'filter');
    const iteratorDescriptor = Reflect.getOwnPropertyDescriptor(
      Array.prototype, Symbol.iterator);
    const isArrayDescriptor = Reflect.getOwnPropertyDescriptor(
      Array, 'isArray');
    let closure;
    try {
      Reflect.defineProperty(Array.prototype, 'filter', {
        ...filterDescriptor,
        value: () => [],
      });
      Reflect.defineProperty(Array.prototype, Symbol.iterator, {
        ...iteratorDescriptor,
        value: () => ({next: () => ({done: true})}),
      });
      Reflect.defineProperty(Array, 'isArray', {
        ...isArrayDescriptor,
        value: () => false,
      });
      closure = importClosureGaps(root, candidate, {
        changedPaths: [
          'src/owners/consumer.js',
          'src/owners/result-budget-owner.js',
        ],
      });
    } finally {
      Reflect.defineProperty(Array.prototype, 'filter', filterDescriptor);
      Reflect.defineProperty(
        Array.prototype, Symbol.iterator, iteratorDescriptor);
      Reflect.defineProperty(Array, 'isArray', isArrayDescriptor);
    }
    t.same(closure.omittedChangedPaths, ['src/owners/result-budget-owner.js']);
    t.same(closure.importGaps, [{
      importer: 'src/owners/consumer.js',
      imported: 'src/owners/result-budget-owner.js',
    }]);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a changed file the candidate never imports is omitted-only, not a gap', (t) => {
    const root = setup();
    write(root, 'src/owners/consumer.js', 'export const x = 1;\n');
    const candidate = {baseCommit: 'deadbeef', paths: ['src/owners/consumer.js']};
    const closure = importClosureGaps(root, candidate, {
      changedPaths: ['src/owners/consumer.js', 'src/unrelated-wip.js'],
    });
    t.same(closure.omittedChangedPaths, ['src/unrelated-wip.js']);
    t.same(closure.importGaps, [], 'no import edge, no gap');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a fully covered candidate yields no gaps', (t) => {
    const root = setup();
    write(root, 'src/owners/consumer.js',
      'import {budget} from \'./result-budget-owner.js\';\nexport const x = budget;\n');
    write(root, 'src/owners/result-budget-owner.js', 'export const budget = 1;\n');
    const candidate = {
      baseCommit: 'deadbeef',
      paths: ['src/owners/consumer.js', 'src/owners/result-budget-owner.js'],
    };
    const closure = importClosureGaps(root, candidate, {
      changedPaths: ['src/owners/consumer.js', 'src/owners/result-budget-owner.js'],
    });
    t.same(closure.omittedChangedPaths, []);
    t.same(closure.importGaps, []);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('extensionless relative specifiers resolve with the .js suffix', (t) => {
    const root = setup();
    write(root, 'src/owners/consumer.js',
      'import {budget} from \'../shared/result-budget\';\nexport const x = budget;\n');
    const candidate = {baseCommit: 'deadbeef', paths: ['src/owners/consumer.js']};
    const closure = importClosureGaps(root, candidate, {
      changedPaths: ['src/shared/result-budget.js'],
    });
    t.same(closure.importGaps, [{
      importer: 'src/owners/consumer.js',
      imported: 'src/shared/result-budget.js',
    }]);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('missing candidate identity or unreadable files degrade to empty, never throw', (t) => {
    const root = setup();
    t.same(importClosureGaps(root, null), {omittedChangedPaths: [], importGaps: []});
    t.same(importClosureGaps(root, {paths: ['src/a.js']}),
      {omittedChangedPaths: [], importGaps: []}, 'no baseCommit');
    const closure = importClosureGaps(root, {
      baseCommit: 'deadbeef',
      paths: ['src/does-not-exist.js'],
    }, {changedPaths: ['src/other.js']});
    t.same(closure.importGaps, [], 'unreadable importer contributes no gaps');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('committed-and-clean landed dependencies are not in-flight gaps', (t) => {
    // changedSourcePathsSinceBase drives the no-explicit-changedPaths path
    // (landing preflight). A file changed between base and HEAD but now
    // committed AND clean is a landed dependency (a sibling Quest that landed
    // mid-attempt), not an omission. Simulate via a real git repo.
    const root = setup();
    const run = (args) => execFileSync('git', args, {cwd: root, stdio: 'pipe'});
    run(['init', '-q']);
    run(['config', 'user.email', 't@t']);
    run(['config', 'user.name', 't']);
    write(root, 'src/owners/consumer.js',
      'import {budget} from \'./result-budget-owner.js\';\nexport const x = budget;\n');
    write(root, 'src/owners/result-budget-owner.js', 'export const budget = 1;\n');
    run(['add', '-A']);
    run(['commit', '-q', '-m', 'base']);
    const base = run(['rev-parse', 'HEAD']).toString().trim();
    // Sibling quest lands: modify the owner and commit it (now clean).
    write(root, 'src/owners/result-budget-owner.js', 'export const budget = 2;\n');
    run(['add', '-A']);
    run(['commit', '-q', '-m', 'sibling landed']);
    // This quest's in-flight change: only the consumer (uncommitted).
    write(root, 'src/owners/consumer.js',
      'import {budget} from \'./result-budget-owner.js\';\nexport const y = budget;\n');
    const closure = importClosureGaps(root, {
      baseCommit: base,
      paths: ['src/owners/consumer.js'],
    });
    t.same(closure.importGaps, [],
      'committed-and-clean sibling-landed owner is not flagged as an omission');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an uncommitted in-flight owner change IS still flagged', (t) => {
    const root = setup();
    const run = (args) => execFileSync('git', args, {cwd: root, stdio: 'pipe'});
    run(['init', '-q']);
    run(['config', 'user.email', 't@t']);
    run(['config', 'user.name', 't']);
    write(root, 'src/owners/consumer.js',
      'import {budget} from \'./result-budget-owner.js\';\nexport const x = budget;\n');
    write(root, 'src/owners/result-budget-owner.js', 'export const budget = 1;\n');
    run(['add', '-A']);
    run(['commit', '-q', '-m', 'base']);
    const base = run(['rev-parse', 'HEAD']).toString().trim();
    // Both consumer (candidate) and owner (omitted) are uncommitted.
    write(root, 'src/owners/consumer.js',
      'import {budget} from \'./result-budget-owner.js\';\nexport const y = budget;\n');
    write(root, 'src/owners/result-budget-owner.js', 'export const budget = 2;\n');
    const closure = importClosureGaps(root, {
      baseCommit: base,
      paths: ['src/owners/consumer.js'],
    });
    t.same(closure.importGaps, [{
      importer: 'src/owners/consumer.js',
      imported: 'src/owners/result-budget-owner.js',
    }], 'uncommitted omitted owner is still a genuine gap');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
