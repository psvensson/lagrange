import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {historicalArtifactRootDigest} from
  '../../scripts/solve/historical-artifact-root-digest.js';
import {writeReport} from '../../scripts/solve/report.js';
import {
  migrateReportProjections,
  verifyReportProjectionRetention,
} from '../../scripts/solve/report-retention.js';
import {appendEvent, saveQuest} from '../../scripts/solve/store.js';

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'});
}

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-retention-'));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'solver@example.invalid']);
  git(root, ['config', 'user.name', 'Solver']);
  fs.writeFileSync(path.join(root, '.gitignore'), 'solve/state/\n');
  for (const id of ['alpha', 'beta']) {
    saveQuest(root, {
      id,
      class: 'process',
      statement: `Close ${id}.`,
      doneWhen: {probe: 'oracle', args: {file: `${id}.json`}},
      frontiers: [{
        id: `${id}-main`, priority: 1,
        metric: {probe: 'oracle', args: {file: `${id}.json`}},
      }],
      constraints: [],
    });
    appendEvent(root, id, {
      type: 'quest', status: 'solved', evidence: `${id}.json`,
    });
    writeReport(root, id);
  }
  const reportRoot = path.join(root, 'solve', 'report');
  fs.mkdirSync(path.join(reportRoot, 'core-logic-live-validation'), {recursive: true});
  fs.writeFileSync(path.join(reportRoot, 'rolling-restart.md'), 'unique markdown\n');
  fs.writeFileSync(path.join(reportRoot, 'formation-probe-runs.ndjson'), '{}\n');
  fs.writeFileSync(
    path.join(reportRoot, 'core-logic-live-validation', 'evidence.json'),
    '{"unique":true}\n',
  );
  fs.writeFileSync(path.join(root, 'solve', 'OVERVIEW.generated.md'), 'overview\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'legacy tracked projections']);
  return root;
}

tap.test('ordinary reports migrate to ignored on-demand projections', (t) => {
  const root = makeRoot();
  const clone = `${root}-clone`;
  t.teardown(() => {
    fs.rmSync(root, {recursive: true, force: true});
    fs.rmSync(clone, {recursive: true, force: true});
  });
  fs.writeFileSync(path.join(root, '.gitignore'), [
    'solve/state/',
    '/solve/report/*.md',
    '!/solve/report/rolling-restart.md',
    '/solve/OVERVIEW.generated.md',
    '',
  ].join('\n'));

  const {manifest} = migrateReportProjections(root);
  t.equal(manifest.totals.removedFiles, 3,
    'two Quest reports and one overview are classified as projections');
  t.same(manifest.retained.map((entry) => entry.path), [
    'solve/report/core-logic-live-validation/evidence.json',
    'solve/report/formation-probe-runs.ndjson',
    'solve/report/rolling-restart.md',
  ]);
  t.match(git(root, ['status', '--short']), / D solve\/report\/alpha\.md/u,
    'tracked projection removal remains visible to Git');
  t.ok(verifyReportProjectionRetention(root).ok,
    'manifest hashes and ignore boundaries verify before commit');

  writeReport(root, 'alpha');
  const firstDigest = historicalArtifactRootDigest(root);
  fs.appendFileSync(path.join(root, 'solve', 'report', 'alpha.md'), 'local-only\n');
  t.equal(historicalArtifactRootDigest(root), firstDigest,
    'ordinary local regeneration does not perturb the historical root digest');
  const uniquePath = path.join(root, 'solve', 'report', 'rolling-restart.md');
  fs.appendFileSync(uniquePath, 'changed\n');
  t.not(historicalArtifactRootDigest(root), firstDigest,
    'retained unique evidence remains part of the historical digest');
  fs.writeFileSync(uniquePath, 'unique markdown\n');

  fs.rmSync(path.join(root, 'solve', 'report', 'alpha.md'));
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'make reports local projections']);
  writeReport(root, 'alpha');
  git(root, ['clone', '--quiet', root, clone]);
  writeReport(clone, 'alpha');
  t.equal(
    fs.readFileSync(path.join(root, 'solve', 'report', 'alpha.md'), 'utf8'),
    fs.readFileSync(path.join(clone, 'solve', 'report', 'alpha.md'), 'utf8'),
    'clean-clone report regeneration is byte-identical',
  );
  t.same(git(clone, ['ls-files', 'solve/report']).trim().split('\n'), [
    'solve/report/core-logic-live-validation/evidence.json',
    'solve/report/formation-probe-runs.ndjson',
    'solve/report/rolling-restart.md',
  ], 'only non-regenerable report evidence remains tracked');
  t.ok(verifyReportProjectionRetention(clone).ok);
  t.end();
});

tap.test('workflow mutations never regenerate the optional report', (t) => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const automaticOwners = [
    'scripts/solve/evidence.js',
    'scripts/solve/park.js',
    'scripts/solve/reopen.js',
    'scripts/solve/step.js',
    'scripts/solve/upgrade.js',
  ];
  for (const relative of automaticOwners) {
    t.notMatch(fs.readFileSync(path.join(root, relative), 'utf8'), /writeReport/u,
      `${relative} mutates durable state without writing a projection`);
  }
  const cli = fs.readFileSync(path.join(root, 'scripts/solve.js'), 'utf8');
  t.equal((cli.match(/writeReport\(/gu) || []).length, 1,
    'only the explicit report command writes a Quest report');
  t.end();
});
