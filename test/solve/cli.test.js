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
    t.match(out, /node scripts\/solve\.js next --id demo/,
      'next-step delegates execution-mode choice to the typed projection');
    t.ok(fs.existsSync(path.join(root, 'solve', 'quests', 'demo.json')));
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('new --class sets the quest class and refuses unknown classes', (t) => {
    const root = tmp();
    run(root, ['new', '--id', 'demo-process', '--statement', 'decide', '--class', 'process']);
    const quest = JSON.parse(fs.readFileSync(
      path.join(root, 'solve', 'quests', 'demo-process.json'), 'utf8'));
    t.equal(quest.class, 'process');

    run(root, ['new', '--id', 'demo-default', '--statement', 'measure']);
    const defaulted = JSON.parse(fs.readFileSync(
      path.join(root, 'solve', 'quests', 'demo-default.json'), 'utf8'));
    t.equal(defaulted.class, 'product', 'class defaults to product');

    t.throws(
      () => run(root, ['new', '--id', 'demo-bad', '--statement', 'x',
        '--class', 'meta']),
      /--class must be one of product\|process/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('new authors versioned planning links without JSON hand-editing', (t) => {
    const root = tmp();
    run(root, [
      'new', '--id', 'linked', '--statement', 'The linked scenario passes.',
      '--plan-doc', 'solve/specs/linked.md',
      '--spec-ref', 'solve/specs/linked.md#done',
      '--roadmap-row', 'ROW-1',
      '--closes-cl', 'CL-1', '--closes-cl', 'CL-2',
    ]);
    const quest = JSON.parse(fs.readFileSync(
      path.join(root, 'solve', 'quests', 'linked.json'), 'utf8'));
    t.equal(quest.authoringContractVersion, 1);
    t.equal(quest.links.planDoc, 'solve/specs/linked.md');
    t.equal(quest.links.specRef, 'solve/specs/linked.md#done');
    t.equal(quest.links.roadmapRow, 'ROW-1');
    t.same(quest.links.closesCL, ['CL-1', 'CL-2']);
    t.equal(quest.links.draftedAtCommit, null,
      'non-Git fixture records an honest null draft commit');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('lint failure creates neither declaration nor pending state', (t) => {
    const root = tmp();
    run(root, ['new', '--id', 'invalid-product', '--statement', 'It passes.']);
    t.throws(() => run(root, ['step', '--id', 'invalid-product']),
      /quest lint failed.*planning link/u);
    t.notOk(fs.existsSync(path.join(
      root, 'solve', 'log', 'invalid-product.ndjson')));
    t.notOk(fs.existsSync(path.join(
      root, 'solve', 'state', 'invalid-product.pending.json')));
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('first execution seals the extended versioned declaration', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    run(root, [
      'new', '--id', 'sealed', '--statement', 'A process result is recorded.',
      '--class', 'process',
    ]);
    const questFile = path.join(root, 'solve', 'quests', 'sealed.json');
    const quest = JSON.parse(fs.readFileSync(questFile, 'utf8'));
    quest.doneWhen = {probe: 'oracle', args: {file: oracle}};
    quest.frontiers[0].metric = {probe: 'oracle', args: {file: oracle}};
    fs.writeFileSync(questFile, `${JSON.stringify(quest, null, 2)}\n`);
    run(root, ['step', '--id', 'sealed']);
    const declared = fs.readFileSync(
      path.join(root, 'solve', 'log', 'sealed.ndjson'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line))
      .find((event) => event.type === 'quest-declared');
    t.equal(declared.sealed.authoringContractVersion, 1);
    t.equal(declared.sealed.statement, quest.statement);
    t.equal(declared.sealed.class, 'process');
    t.same(declared.sealed.frontierIds, ['sealed-main']);
    t.same(declared.sealed.constraints, quest.constraints);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('new --force cannot erase a Quest with append-only history', (t) => {
    const root = tmp();
    run(root, [
      'new', '--id', 'history', '--statement', 'A process decision is recorded.',
      '--class', 'process',
    ]);
    run(root, [
      'finding', '--id', 'history', '--frontier', 'history-main',
      '--claim', 'history exists',
    ]);
    t.throws(() => run(root, [
      'new', '--id', 'history', '--statement', 'replacement', '--force',
    ]), /cannot overwrite a Quest with append-only history/u);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('new cannot reuse an ID whose Quest file was deleted over history', (t) => {
    const root = tmp();
    run(root, [
      'new', '--id', 'deleted-history', '--statement', 'A process decision is recorded.',
      '--class', 'process',
    ]);
    run(root, [
      'finding', '--id', 'deleted-history', '--frontier', 'deleted-history-main',
      '--claim', 'history exists',
    ]);
    fs.rmSync(path.join(root, 'solve', 'quests', 'deleted-history.json'));
    t.throws(() => run(root, [
      'new', '--id', 'deleted-history', '--statement', 'replacement', '--force',
    ]), /Quest ID has append-only history/u);
    t.throws(() => run(root, [
      'new', '--id', 'deleted-history', '--statement', 'replacement',
    ]), /Quest ID has append-only history/u);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('lint emits its report and exits nonzero for invalid drafts', (t) => {
    const root = tmp();
    run(root, ['new', '--id', 'lint-fail', '--statement', 'It passes.']);
    const error = t.throws(
      () => run(root, ['lint', '--id', 'lint-fail', '--json']),
    );
    t.match(error.stdout, /"status": "fail"/u);
    t.equal(error.status, 1);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('run rejects removed options instead of silently ignoring them', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    writeOracleGoal(root, 'unsupported-run-option', oracle);
    for (const [flag, value] of [
      ['--commit-every', '1'],
      ['--stall-window', '3'],
      ['--no-commit', null],
    ]) {
      const flagArgs = value === null ? [flag] : [flag, value];
      t.throws(
        () => run(root, ['run', '--id', 'unsupported-run-option', ...flagArgs]),
        new RegExp(`unsupported option.*${flag}`, 'u'),
      );
    }
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
    t.match(begin, /pinned demo-main: metric 2/);

    // Operator does the work + re-runs the harness: metric 2 -> 1.
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const diff = path.join(root, 'solve', 'changes', 'demo', 'a.diff');
    fs.mkdirSync(path.dirname(diff), {recursive: true});
    fs.writeFileSync(diff, [
      'diff --git a/src/demo.js b/src/demo.js',
      '--- a/src/demo.js',
      '+++ b/src/demo.js',
      '@@ -1 +1 @@',
      '-before',
      '+after',
    ].join('\n'));
    const commit = run(root, ['step', '--id', 'demo', '--commit',
      '--changeRef', `diff:${diff}`, '--summary', 'tighten']);
    t.match(commit, /recorded attempt on demo-main: metric 2 -> 1 \(PROGRESS\)/);

    const status = JSON.parse(run(root, ['status', '--id', 'demo']));
    t.equal(status.frontiers[0].attempts, 1, 'attempt recorded');
    t.equal(status.frontiers[0].rungIndex, 0, 'progress kept the rung');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('manual step commit requires the explicit commit flag', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    writeOracleGoal(root, 'demo', oracle);
    run(root, ['step', '--id', 'demo']);

    const diff = path.join(root, 'solve', 'changes', 'demo', 'missing-commit.diff');
    fs.mkdirSync(path.dirname(diff), {recursive: true});
    fs.writeFileSync(diff, [
      'diff --git a/src/demo.js b/src/demo.js',
      '--- a/src/demo.js',
      '+++ b/src/demo.js',
      '@@ -1 +1 @@',
      '-before',
      '+after',
    ].join('\n'));

    t.throws(
      () => run(root, ['step', '--id', 'demo', '--changeRef', `diff:${diff}`]),
      /requires --commit/,
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('verifier approvals require a structured content fingerprint', (t) => {
    const root = tmp();
    writeOracleGoal(root, 'demo', path.join(root, 'oracle.json'));
    t.throws(() => run(root, [
      'finding', '--id', 'demo', '--frontier', 'demo-main',
      '--kind', 'verifier-approval', '--claim', 'approved',
      '--evidence', 'subagent:verify-1',
    ]), /verification-scope/u);
    const fingerprint = `sha256:${'a'.repeat(64)}`;
    run(root, [
      'finding', '--id', 'demo', '--frontier', 'demo-main',
      '--kind', 'verifier-approval', '--claim', 'approved',
      '--evidence', 'subagent:verify-1',
      '--verification-scope', 'attempt',
      '--verification-fingerprint', fingerprint,
    ]);
    const event = fs.readFileSync(
      path.join(root, 'solve', 'log', 'demo.ndjson'), 'utf8')
      .trim().split('\n').map((line) => JSON.parse(line))[0];
    t.same(event.verification, {
      schemaVersion: 1,
      scope: 'attempt',
      fingerprint,
    });
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

tap.test('override + reflect CLI subcommands', async (t) => {
  function readLogFile(root, id) {
    const file = path.join(root, 'solve', 'log', `${id}.ndjson`);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').trim().split('\n')
      .filter(Boolean).map((line) => JSON.parse(line));
  }

  t.test('override records a guard-override event for an overridable guard', (t) => {
    const root = tmp();
    writeOracleGoal(root, 'demo', path.join(root, 'oracle.json'));
    fs.writeFileSync(path.join(root, 'oracle.json'), JSON.stringify({metric: 3, target: 0}));
    const out = run(root, ['override', '--id', 'demo', '--frontier', 'demo-main',
      '--guard', 'theory', '--reason', 'pursuing a falsifiable hunch']);
    t.match(out, /recorded override/, 'confirms the override');
    const overrides = readLogFile(root, 'demo').filter((e) => e.type === 'guard-override');
    t.equal(overrides.length, 1, 'one override event recorded');
    t.equal(overrides[0].reason, 'pursuing a falsifiable hunch', 'reason persisted');
    t.equal(overrides[0].code, 'blocked-theory', 'theory alias mapped to its code');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('override refuses a non-overridable invariant', (t) => {
    const root = tmp();
    writeOracleGoal(root, 'demo', path.join(root, 'oracle.json'));
    t.throws(
      () => run(root, ['override', '--id', 'demo', '--frontier', 'demo-main',
        '--guard', 'regression', '--reason', 'I want to']),
      /not overridable/,
      'honesty/integrity invariants cannot be overridden');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('override requires a reason', (t) => {
    const root = tmp();
    writeOracleGoal(root, 'demo', path.join(root, 'oracle.json'));
    t.throws(
      () => run(root, ['override', '--id', 'demo', '--frontier', 'demo-main',
        '--guard', 'theory']),
      /--reason/,
      'a blank escape hatch is refused');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('reflect records a reflection note', (t) => {
    const root = tmp();
    writeOracleGoal(root, 'demo', path.join(root, 'oracle.json'));
    const out = run(root, ['reflect', '--id', 'demo', '--frontier', 'demo-main',
      '--note', 'the coupling is the real frontier']);
    t.match(out, /recorded reflection/, 'confirms the reflection');
    const reflections = readLogFile(root, 'demo').filter((e) => e.type === 'reflection');
    t.equal(reflections.length, 1, 'one reflection event recorded');
    t.equal(reflections[0].note, 'the coupling is the real frontier', 'note persisted');
    t.equal(reflections[0].trigger, 'manual', 'defaults to the manual trigger');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('reflect requires a note', (t) => {
    const root = tmp();
    writeOracleGoal(root, 'demo', path.join(root, 'oracle.json'));
    t.throws(
      () => run(root, ['reflect', '--id', 'demo']),
      /--note/,
      'an empty reflection is refused');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
