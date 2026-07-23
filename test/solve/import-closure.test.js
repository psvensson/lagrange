import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
    const closure = importClosureGaps(root, candidate, {
      changedPaths: ['src/owners/consumer.js', 'src/owners/result-budget-owner.js'],
    });
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
});
