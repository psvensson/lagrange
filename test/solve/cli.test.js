import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../scripts/solve.js');

function run(root, args) {
  return execFileSync('node', [CLI, ...args, '--root', root],
    {encoding: 'utf8'});
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-cli-'));
}

// A quest whose done_when + frontier metric both read a file-backed oracle, so the dry
// executor can drive it to SOLVED deterministically end-to-end through the CLI.
function writeOracleGoal(root, id, oracleFile) {
  const quest = {
    id,
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: oracleFile}},
    frontiers: [
      {id: `${id}-main`, priority: 1,
        metric: {probe: 'oracle', args: {file: oracleFile}}},
    ],
  };
  const file = path.join(root, 'solve', 'quests', `${id}.json`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(quest, null, 2));
}

tap.test('solve CLI smoke (P2)', async (t) => {
  t.test('new scaffolds a quest file', (t) => {
    const root = tmp();
    const out = run(root, ['new', '--id', 'demo', '--statement', 'hello']);
    t.match(out, /created/);
    t.ok(fs.existsSync(path.join(root, 'solve', 'quests', 'demo.json')));
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('run dry drives an oracle quest to SOLVED + writes report', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
    writeOracleGoal(root, 'demo', oracle);

    run(root, ['finding', '--id', 'demo', '--frontier', 'demo-main',
      '--claim', 'naive retry loops', '--rulesOut', 'naive-retry']);

    const out = run(root, ['run', '--id', 'demo', '--max', '50']);
    t.match(out, /terminal: solved/, 'reaches SOLVED');

    const status = JSON.parse(run(root, ['status', '--id', 'demo']));
    t.equal(status.questStatus, 'solved');

    const report = run(root, ['report', '--id', 'demo']);
    t.match(report, /Outcome:\*\* SOLVED/);
    t.match(report, /naive retry loops/, 'report carries the finding');
    t.ok(fs.existsSync(path.join(root, 'solve', 'report', 'demo.md')));
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('probe subcommand reports metric/done/evidence', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    const out = run(root, ['probe', '--probe', 'oracle', '--file', oracle]);
    const parsed = JSON.parse(out);
    t.equal(parsed.metric, 2);
    t.equal(parsed.done, false);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('manual step begin/commit drives an oracle quest via the CLI', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    writeOracleGoal(root, 'demo', oracle);

    const begin = run(root, ['step', '--id', 'demo']);
    t.match(begin, /Rung 0 \(local-fix\)/, 'dossier printed');
    t.match(begin, /baseline metric: 2/);

    // Operator does the work + re-runs the harness: metric 2 -> 1.
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const diff = path.join(root, 'a.diff');
    fs.writeFileSync(diff, '# change\n');
    const commit = run(root, ['step', '--id', 'demo', '--commit',
      '--changeRef', `diff:${diff}`, '--summary', 'tighten']);
    t.match(commit, /metric 2 -> 1 \(PROGRESS\)/);

    const status = JSON.parse(run(root, ['status', '--id', 'demo']));
    t.equal(status.frontiers[0].attempts, 1, 'attempt recorded');
    t.equal(status.frontiers[0].rungIndex, 0, 'progress kept the rung');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('unknown command exits non-zero', (t) => {
    const root = tmp();
    t.throws(() => run(root, ['frobnicate']));
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
