import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent, appendFinding} from '../../scripts/solve/store.js';
import {runStep} from '../../scripts/solve/step.js';
import {writeReport} from '../../scripts/solve/report.js';
import {
  buildHandoff,
  classifyDirtyPaths,
  gitDirtyFiles,
  renderHandoff,
  autoCommitQuest,
  refreshDerivedInventoriesForCommit,
} from '../../scripts/solve/handoff.js';
import {runFrontierCommand} from '../../scripts/solve/frontier.js';
import {execFileSync, spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const FRONTIER_BOARD_PATH = 'solve/FRONTIER.generated.md';
const MARKER_WAIT_TIMEOUT_MS = 5_000;
const MARKER_WAIT_POLL_MS = 10;

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-'));
}

async function waitForFile(file) {
  const deadline = Date.now() + MARKER_WAIT_TIMEOUT_MS;
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for fixture marker ${file}`);
    }
    await new Promise((resolve) => setTimeout(resolve, MARKER_WAIT_POLL_MS));
  }
}

function makeQuest(root, id = 'demo', oracle = path.join(root, 'oracle.json')) {
  fs.mkdirSync(path.dirname(oracle), {recursive: true});
  fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
  const quest = {
    id,
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    class: 'process',
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [
      {id: `${id}-main`, priority: 1,
        metric: {probe: 'oracle', args: {file: oracle}}},
    ],
  };
  saveQuest(root, quest);
  return {quest, oracle};
}

function makeOwnedOracleQuest(root, id = 'demo') {
  return makeQuest(root, id,
    path.join(root, 'solve', 'oracle', `${id}.json`));
}

function makeDiff(root, questId, name, changedPath = 'src/demo.js') {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    `diff --git a/${changedPath} b/${changedPath}`,
    `--- a/${changedPath}`,
    `+++ b/${changedPath}`,
    '@@ -1 +1 @@',
    '-before',
    '+after',
    '',
  ].join('\n'));
  return `diff:${path.relative(root, file)}`;
}

function makeCanonicalDiff(root, questId, name, changedPath) {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const content = execFileSync('git', [
    'diff',
    '--binary',
    '--full-index',
    '--no-ext-diff',
    'HEAD',
    '--',
    changedPath,
  ], {cwd: root, encoding: 'utf8'});
  fs.writeFileSync(file, content);
  return `diff:${path.relative(root, file)}`;
}

tap.test('scope-safe handoff (Concern 4)', async (t) => {
  t.test('dirty discovery keeps a bounded buffer above Node default', (t) => {
    const pathCount = 24_000;
    const status = Array.from({length: pathCount}, (_unused, index) =>
      `?? test-output/reports/${String(index).padStart(5, '0')}-` +
      'large-worktree-evidence-report.json\n').join('');
    let options = null;
    const files = gitDirtyFiles('/fixture', (_command, args, spawnOptions) => {
      t.same(args, ['status', '--porcelain', '-uall']);
      options = spawnOptions;
      return status;
    });

    t.ok(Buffer.byteLength(status) > 1024 * 1024,
      'fixture exceeds the child-process default that failed during landing');
    t.ok(options.maxBuffer >= Buffer.byteLength(status),
      'handoff owner applies its bounded Git buffer to dirty discovery');
    t.equal(files.length, pathCount,
      'large unrelated evidence corpus remains visible for scope exclusion');
    t.end();
  });

  t.test('classifies dirty files into in-scope and out-of-scope', (t) => {
    const scope = {
      files: ['solve/quests/demo.json', 'solve/log/demo.ndjson',
        'solve/report/demo.md', 'solve/state/demo.json'],
      changeDirPrefix: 'solve/changes/demo/',
      diffReferenced: ['src/demo.js', 'test/demo.test.js'],
    };
    const dirty = [
      'solve/quests/demo.json',
      'solve/changes/demo/fix.diff',
      'src/demo.js',
      'test/demo.test.js',
      'src/unrelated.js',
      'solve/quests/other.json',
      'README.md',
    ];
    const {inScope, outOfScope} = classifyDirtyPaths(dirty, scope);
    t.same(inScope, [
      'solve/changes/demo/fix.diff',
      'solve/quests/demo.json',
      'src/demo.js',
      'test/demo.test.js',
    ], 'owns its solve artifacts, change dir and diff-referenced files');
    t.same(outOfScope, [
      'README.md',
      'solve/quests/other.json',
      'src/unrelated.js',
    ], 'excludes other quests and unrelated dirty files');
    t.end();
  });

  t.test('builds a handoff that excludes unrelated dirty files', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped fix',
    });
    // A source-file change requires a recorded subagent verification finding.
    appendFinding(root, quest.id, {
      frontier: `${quest.id}-main`,
      claim: 'subagent verified the source change against quest intent',
      evidence: 'subagent:verify-1',
    });
    writeReport(root, quest.id);

    const dirtyFiles = [
      'solve/quests/demo.json',
      'solve/log/demo.ndjson',
      'solve/report/demo.md',
      'solve/changes/demo/fix.diff',
      'solve/FRONTIER.generated.md',
      'docs/demo.md',
      'src/unrelated-other-quest.js',
      'solve/quests/other-quest.json',
    ];
    const handoff = buildHandoff(root, quest, {dirtyFiles});
    t.ok(handoff.ok, 'audit passed so handoff is allowed');
    t.ok(handoff.inScope.includes('solve/FRONTIER.generated.md'),
      'the regenerated frontier board lands with the Quest that staled it, ' +
      'instead of needing a separate bookkeeping commit');
    t.ok(handoff.inScope.includes('docs/demo.md'), 'includes diff-referenced file');
    t.ok(handoff.inScope.includes('solve/changes/demo/fix.diff'), 'includes change artifact');
    t.ok(handoff.inScope.includes('solve/quests/demo.json'), 'includes quest file');
    t.notOk(handoff.inScope.includes('src/unrelated-other-quest.js'),
      'excludes unrelated source');
    t.notOk(handoff.inScope.includes('solve/quests/other-quest.json'),
      'excludes another quest file');
    t.same(handoff.outOfScope,
      [
        'solve/quests/other-quest.json',
        'solve/report/demo.md',
        'src/unrelated-other-quest.js',
      ].sort(),
      'reports the excluded files explicitly');
    t.notOk(handoff.inScope.includes('solve/report/demo.md'),
      'generated reports are not durable handoff scope');

    const md = renderHandoff(handoff);
    t.match(md, /In scope/, 'renders an in-scope section');
    t.match(md, /Out of scope/, 'renders an out-of-scope section');
    t.match(md, /git add/, 'prints the git add command');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('dry-run and checkpoint own only the current Quest oracle', (t) => {
    const root = tmp();
    const {quest, oracle} = makeOwnedOracleQuest(root);
    const siblingOracle = path.join(root, 'solve/oracle/sibling.json');
    fs.writeFileSync(siblingOracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped fix',
    });
    writeReport(root, quest.id);
    const dirtyFiles = [
      'solve/oracle/demo.json',
      'solve/oracle/sibling.json',
      'solve/quests/demo.json',
    ];

    for (const checkpoint of [false, true]) {
      const handoff = buildHandoff(root, quest, {checkpoint, dirtyFiles});
      t.ok(handoff.inScope.includes('solve/oracle/demo.json'),
        `${checkpoint ? 'checkpoint' : 'terminal'} includes current oracle`);
      t.ok(handoff.outOfScope.includes('solve/oracle/sibling.json'),
        `${checkpoint ? 'checkpoint' : 'terminal'} excludes sibling oracle`);
    }
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('refuses to commit until the quest has finished (commit gate)', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    // An in-progress quest (no SOLVED terminal) must not commit, regardless of any
    // informational audit findings.
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      rung: 'local-fix',
      rungIndex: 0,
      metricBefore: 2,
      metricAfter: 1,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      changeRef: 'diff:src/demo.js',
    });
    const handoff = buildHandoff(root, quest, {dirtyFiles: ['solve/quests/demo.json']});
    t.notOk(handoff.ok, 'commit refused because the quest has not finished');
    t.notOk(handoff.gate.ready, 'the commit gate is not ready');
    const md = renderHandoff(handoff);
    t.match(md, /REFUSED/, 'render makes the refusal explicit');
    t.match(md, /full audit/, 'render names the terminal precondition');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a clean in-scope set still commits nothing when nothing is dirty', (t) => {
    const root = tmp();
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'doc fix',
    });
    const handoff = buildHandoff(root, quest, {dirtyFiles: []});
    t.ok(handoff.ok, 'audit passes');
    t.same(handoff.inScope, [], 'nothing dirty means nothing to commit');
    const md = renderHandoff(handoff);
    t.match(md, /nothing to commit/, 'render notes there is nothing to do');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

function initGit(root) {
  const run = (...args) => execFileSync('git', args, {cwd: root, stdio: 'ignore'});
  run('init');
  run('config', 'user.email', 'solver@example.com');
  run('config', 'user.name', 'Solver');
  run('config', 'commit.gpgsign', 'false');
  // Seed an initial commit so subsequent commits have a parent.
  fs.writeFileSync(path.join(root, '.gitkeep'), '');
  run('add', '-A');
  run('commit', '-m', 'init');
}

function committedFiles(root) {
  return execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'],
    {cwd: root, encoding: 'utf8'}).split('\n').filter(Boolean);
}

tap.test('auto commit (never pushes) (R1)', async (t) => {
  t.test('source-digest inventory refresh is reusable and content-checked', (t) => {
    const root = tmp();
    const counter = path.join(root, 'refresh-count.txt');
    const sourceFile = path.join(root, 'src', 'input.js');
    const globalOutput = path.join(root,
      'solve/changes/global-owner-debt-inventory/inventory.json');
    const priorityOutput = path.join(root,
      'solve/changes/priority-recovery-owner-inventory/inventory.json');
    const generators = [
      ['generate-global-owner-debt-inventory.js', globalOutput, 'global'],
      ['generate-priority-recovery-owner-inventory.js', priorityOutput, 'priority'],
    ];
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.mkdirSync(path.join(root, 'test'), {recursive: true});
    fs.writeFileSync(sourceFile, 'version-one\n');
    for (const [name, output, label] of generators) {
      fs.writeFileSync(path.join(root, 'scripts', name), [
        'const fs = require(\'node:fs\');',
        'const path = require(\'node:path\');',
        `fs.appendFileSync(${JSON.stringify(counter)}, ${JSON.stringify(label)} + '\\n');`,
        `fs.mkdirSync(path.dirname(${JSON.stringify(output)}), {recursive: true});`,
        `fs.writeFileSync(${JSON.stringify(output)}, ` +
          `${JSON.stringify(label)} + ':' + ` +
          `fs.readFileSync(${JSON.stringify(sourceFile)}, 'utf8'));`,
        '',
      ].join('\n'));
    }

    const first = refreshDerivedInventoriesForCommit(root, 'sha256:first');
    const second = refreshDerivedInventoriesForCommit(root, 'sha256:first');
    t.equal(first.refreshed, true);
    t.equal(first.cached, false);
    t.equal(second.refreshed, false);
    t.equal(second.cached, true,
      'retrying the same final source digest runs neither generator again');
    t.equal(fs.readFileSync(counter, 'utf8').trim().split('\n').length, 2,
      'each inventory refreshed exactly once');

    fs.writeFileSync(sourceFile, 'version-two\n');
    const sourceChanged = refreshDerivedInventoriesForCommit(root, 'sha256:first');
    t.equal(sourceChanged.refreshed, true,
      'repository-wide source drift invalidates the Quest-digest cache entry');
    t.match(fs.readFileSync(globalOutput, 'utf8'), /version-two/u);
    t.match(fs.readFileSync(priorityOutput, 'utf8'), /version-two/u);

    const sortDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype, 'sort');
    const setHasDescriptor = Object.getOwnPropertyDescriptor(
      Set.prototype, 'has');
    try {
      Reflect.defineProperty(Array.prototype, 'sort', {
        ...sortDescriptor,
        value: function hostileSort() {
          this.length = 0;
          return this;
        },
      });
      Reflect.defineProperty(Set.prototype, 'has', {
        ...setHasDescriptor,
        value: () => false,
      });
      fs.writeFileSync(sourceFile, 'version-three\n');
      const hostileChanged = refreshDerivedInventoriesForCommit(
        root, 'sha256:first');
      t.equal(hostileChanged.refreshed, true,
        'ambient collection changes cannot empty repository enumeration');
      t.match(fs.readFileSync(globalOutput, 'utf8'), /version-three/u);
      t.match(fs.readFileSync(priorityOutput, 'utf8'), /version-three/u);
    } finally {
      Reflect.defineProperty(Array.prototype, 'sort', sortDescriptor);
      Reflect.defineProperty(Set.prototype, 'has', setHasDescriptor);
    }

    fs.writeFileSync(globalOutput, 'tampered\n');
    const repaired = refreshDerivedInventoriesForCommit(root, 'sha256:first');
    t.equal(repaired.refreshed, true,
      'cached metadata never hides drift in a derived inventory');
    t.equal(fs.readFileSync(counter, 'utf8').trim().split('\n').length, 8);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('source mutation during generation retries one coherent epoch', (t) => {
    const root = tmp();
    const sourceFile = path.join(root, 'src', 'input.js');
    const counter = path.join(root, 'refresh-count.txt');
    const outputs = [
      path.join(root,
        'solve/changes/global-owner-debt-inventory/inventory.json'),
      path.join(root,
        'solve/changes/priority-recovery-owner-inventory/inventory.json'),
    ];
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.mkdirSync(path.join(root, 'test'), {recursive: true});
    fs.writeFileSync(sourceFile, 'version-one\n');
    for (const [index, name] of [
      'generate-global-owner-debt-inventory.js',
      'generate-priority-recovery-owner-inventory.js',
    ].entries()) {
      fs.writeFileSync(path.join(root, 'scripts', name), [
        'const fs = require(\'node:fs\');',
        'const path = require(\'node:path\');',
        `const value = fs.readFileSync(${JSON.stringify(sourceFile)}, 'utf8');`,
        ...(index === 0 ? [
          'if (value.includes(\'version-one\')) ' +
            `fs.writeFileSync(${JSON.stringify(sourceFile)}, 'version-two\\n');`,
        ] : []),
        `fs.appendFileSync(${JSON.stringify(counter)}, 'run\\n');`,
        `fs.mkdirSync(path.dirname(${JSON.stringify(outputs[index])}), ` +
          '{recursive: true});',
        `fs.writeFileSync(${JSON.stringify(outputs[index])}, value);`,
        '',
      ].join('\n'));
    }
    const result = refreshDerivedInventoriesForCommit(root, 'sha256:stable');
    t.equal(result.refreshed, true);
    t.match(fs.readFileSync(outputs[0], 'utf8'), /version-two/u,
      'global inventory was retried after publishing the old epoch');
    t.match(fs.readFileSync(outputs[1], 'utf8'), /version-two/u,
      'priority inventory and global inventory share the stable epoch');
    t.equal(fs.readFileSync(counter, 'utf8').trim().split('\n').length, 4,
      'both generators reran after the source epoch changed');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an abandoned ownerless inventory lock is recovered', (t) => {
    const root = tmp();
    const outputs = [
      path.join(root,
        'solve/changes/global-owner-debt-inventory/inventory.json'),
      path.join(root,
        'solve/changes/priority-recovery-owner-inventory/inventory.json'),
    ];
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.mkdirSync(path.join(root, 'test'), {recursive: true});
    for (const [index, name] of [
      'generate-global-owner-debt-inventory.js',
      'generate-priority-recovery-owner-inventory.js',
    ].entries()) {
      fs.writeFileSync(path.join(root, 'scripts', name), [
        'const fs = require(\'node:fs\');',
        'const path = require(\'node:path\');',
        `fs.mkdirSync(path.dirname(${JSON.stringify(outputs[index])}), ` +
          '{recursive: true});',
        `fs.writeFileSync(${JSON.stringify(outputs[index])}, 'fresh\\n');`,
        '',
      ].join('\n'));
    }
    const lockDirectory = path.join(
      root, 'solve/state/inventory-refresh/refresh.lock');
    fs.mkdirSync(lockDirectory, {recursive: true});
    const startedAt = Date.now();
    const result = refreshDerivedInventoriesForCommit(root, 'sha256:recovery');
    const elapsedMs = Date.now() - startedAt;
    t.equal(result.refreshed, true);
    t.ok(elapsedMs < 2_000,
      `ownerless lock recovered in a bounded interval (${elapsedMs}ms)`);
    t.equal(fs.existsSync(lockDirectory), false,
      'the recovered lock is released after refresh');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('owner publication is atomic before refresh serialization', async (t) => {
    const root = tmp();
    const formationMarker = path.join(root, 'owner-publication-waiting');
    const releaseMarker = path.join(root, 'release-owner-publication');
    const timeline = path.join(root, 'refresh-timeline.txt');
    const generatorMarkerPrefix = path.join(root, 'generator-');
    const outputs = [
      path.join(root,
        'solve/changes/global-owner-debt-inventory/inventory.json'),
      path.join(root,
        'solve/changes/priority-recovery-owner-inventory/inventory.json'),
    ];
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.mkdirSync(path.join(root, 'test'), {recursive: true});
    for (const [index, name] of [
      'generate-global-owner-debt-inventory.js',
      'generate-priority-recovery-owner-inventory.js',
    ].entries()) {
      fs.writeFileSync(path.join(root, 'scripts', name), [
        'const fs = require(\'node:fs\');',
        'const path = require(\'node:path\');',
        'const caller = process.env.REFRESH_CALLER;',
        ...(index === 0 ? [
          `fs.appendFileSync(${JSON.stringify(timeline)}, ` +
            '`${caller}:start:${Date.now()}\\n`);',
          `fs.writeFileSync(${JSON.stringify(generatorMarkerPrefix)} + caller, ` +
            '\'started\\n\');',
          'const until = Date.now() + 500;',
          'while (Date.now() < until) {}',
          `fs.appendFileSync(${JSON.stringify(timeline)}, ` +
            '`${caller}:end:${Date.now()}\\n`);',
        ] : []),
        `fs.mkdirSync(path.dirname(${JSON.stringify(outputs[index])}), ` +
          '{recursive: true});',
        `fs.writeFileSync(${JSON.stringify(outputs[index])}, caller);`,
        '',
      ].join('\n'));
    }
    const moduleUrl = pathToFileURL(path.resolve(
      'scripts/solve/handoff.js')).href;
    const sourceFor = (digest, delayPublication) => [
      'import fs from \'node:fs\';',
      ...(delayPublication ? [
        'const originalWrite = fs.writeFileSync.bind(fs);',
        'let delayed = false;',
        'fs.writeFileSync = (file, ...args) => {',
        '  const ownerWrite = String(file).includes(\'refresh-owner-\') || ' +
          'String(file).endsWith(\'/owner.json\');',
        '  if (ownerWrite && !delayed) {',
        '    delayed = true;',
        `    originalWrite(${JSON.stringify(formationMarker)}, 'waiting\\n');`,
        `    while (!fs.existsSync(${JSON.stringify(releaseMarker)})) {`,
        '      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);',
        '    }',
        '  }',
        '  return originalWrite(file, ...args);',
        '};',
      ] : []),
      'const {refreshDerivedInventoriesForCommit: refresh} = ' +
        `await import(${JSON.stringify(moduleUrl)});`,
      `refresh(${JSON.stringify(root)}, ${JSON.stringify(digest)});`,
    ].join('\n');
    const runChild = (caller, digest, delayPublication = false) =>
      spawn(process.execPath,
        ['--input-type=module', '--eval', sourceFor(digest, delayPublication)],
        {env: {...process.env, REFRESH_CALLER: caller},
          stdio: ['ignore', 'ignore', 'pipe']});
    const outcome = (child) => new Promise((resolve) => {
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('close', (code) => resolve({code, stderr}));
    });

    const first = runChild('a', 'sha256:formation-a', true);
    await waitForFile(formationMarker);
    const second = runChild('b', 'sha256:formation-b');
    await waitForFile(`${generatorMarkerPrefix}b`);
    fs.writeFileSync(releaseMarker, 'release\n');
    const results = await Promise.all([outcome(first), outcome(second)]);
    t.same(results.map((result) => result.code), [0, 0],
      results.map((result) => result.stderr).join('\n'));
    const intervals = {};
    for (const line of fs.readFileSync(timeline, 'utf8').trim().split('\n')) {
      const [caller, edge, value] = line.split(':');
      intervals[caller] ||= {};
      intervals[caller][edge] = Number(value);
    }
    t.ok(intervals.a.start >= intervals.b.end,
      'a paused owner cannot overlap the owner that claimed the atomic lock');
    fs.rmSync(root, {recursive: true, force: true});
  });

  t.test('concurrent refreshes serialize on the inventory output resource',
    async (t) => {
      const root = tmp();
      const counter = path.join(root, 'refresh-count.txt');
      const version = path.join(root, 'refresh-version.txt');
      const started = path.join(root, 'refresh-started.txt');
      const outputs = [
        path.join(root,
          'solve/changes/global-owner-debt-inventory/inventory.json'),
        path.join(root,
          'solve/changes/priority-recovery-owner-inventory/inventory.json'),
      ];
      fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
      fs.mkdirSync(path.join(root, 'src'), {recursive: true});
      fs.mkdirSync(path.join(root, 'test'), {recursive: true});
      fs.writeFileSync(version, 'one\n');
      for (const [index, name] of [
        'generate-global-owner-debt-inventory.js',
        'generate-priority-recovery-owner-inventory.js',
      ].entries()) {
        fs.writeFileSync(path.join(root, 'scripts', name), [
          'const fs = require(\'node:fs\');',
          'const path = require(\'node:path\');',
          ...(index === 0 ? [
            `fs.writeFileSync(${JSON.stringify(started)}, 'started\\n');`,
          ] : []),
          `const until = Date.now() + ${index === 0 ? 300 : 0};`,
          'while (Date.now() < until) {}',
          `fs.appendFileSync(${JSON.stringify(counter)}, 'run\\n');`,
          `fs.mkdirSync(path.dirname(${JSON.stringify(outputs[index])}), ` +
            '{recursive: true});',
          `fs.writeFileSync(${JSON.stringify(outputs[index])}, ` +
            `fs.readFileSync(${JSON.stringify(version)}, 'utf8'));`,
          '',
        ].join('\n'));
      }
      const moduleUrl = pathToFileURL(path.resolve(
        'scripts/solve/handoff.js')).href;
      const sourceFor = (digest) => [
        'import {refreshDerivedInventoriesForCommit as refresh} from ' +
          `${JSON.stringify(moduleUrl)};`,
        `refresh(${JSON.stringify(root)}, ${JSON.stringify(digest)});`,
      ].join('\n');
      refreshDerivedInventoriesForCommit(root, 'sha256:old');
      fs.writeFileSync(version, 'two\n');
      fs.rmSync(started, {force: true});
      fs.writeFileSync(counter, '');
      const runChild = (digest) => spawn(process.execPath,
        ['--input-type=module', '--eval', sourceFor(digest)],
        {stdio: ['ignore', 'ignore', 'pipe']});
      const newDigest = runChild('sha256:new');
      await waitForFile(started);
      const oldDigest = runChild('sha256:old');
      const closeOrder = [];
      const outcomes = await Promise.all([newDigest, oldDigest].map((child, index) =>
        new Promise((resolve) => {
          let stderr = '';
          child.stderr.on('data', (chunk) => {
            stderr += chunk;
          });
          child.on('close', (code) => {
            closeOrder.push(index);
            resolve({code, stderr});
          });
        })));
      t.same(outcomes.map((outcome) => outcome.code), [0, 0],
        outcomes.map((outcome) => outcome.stderr).join('\n'));
      t.same(closeOrder, [0, 1],
        'a cached old digest cannot return while new outputs are being written');
      t.equal(fs.readFileSync(counter, 'utf8').trim().split('\n').length, 4,
        'the old digest rechecks output identity after the new writer releases');
      fs.rmSync(root, {recursive: true, force: true});
    });

  t.test('skips cleanly outside a git work tree', (t) => {
    const root = tmp();
    makeQuest(root);
    const result = autoCommitQuest(root, 'demo');
    t.same(result, {committed: false, skipped: 'not-a-git-work-tree'});
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a passing-audit step commits only in-scope paths and skips pushing',
    (t) => {
      const root = tmp();
      initGit(root);
      const {quest, oracle} = makeQuest(root);
      runStep(root, quest);
      fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
      // An unrelated dirty file must never be swept into the quest commit.
      fs.mkdirSync(path.join(root, 'src'), {recursive: true});
      fs.writeFileSync(path.join(root, 'src', 'unrelated.js'), 'noise');
      execFileSync('git', ['add', 'src/unrelated.js'], {cwd: root, stdio: 'ignore'});
      const r = runStep(root, quest, {
        changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
        summary: 'scoped doc fix',
        push: false,
      });
      t.notOk(r.commit.committed, 'attempt recording does not commit');
      t.equal(r.commit.skipped, 'explicit-checkpoint-required');
      const committed = autoCommitQuest(root, quest.id);
      t.ok(committed.committed, 'explicit terminal handoff commits');
      t.equal(committed.pushed, false, 'terminal handoff never pushes');
      const files = committedFiles(root);
      t.ok(files.includes('solve/quests/demo.json'), 'commits the quest file');
      t.ok(files.some((f) => f.startsWith('solve/changes/demo/')),
        'commits the change artifact');
      t.notOk(files.includes('src/unrelated.js'), 'excludes the unrelated file');
      const status = execFileSync('git', ['status', '--porcelain', '-uall'],
        {cwd: root, encoding: 'utf8'});
      t.match(status, /src\/unrelated\.js/, 'unrelated file is left uncommitted');
      // Attribution is explicit; an unconfigured workstation invents no agent identity.
      const msg = execFileSync('git', ['log', '-1', '--format=%B'],
        {cwd: root, encoding: 'utf8'});
      t.notMatch(msg, /Co-Authored-By:/u, 'omits an unconfigured co-author trailer');
      fs.rmSync(root, {recursive: true, force: true});
      t.end();
    });

  t.test('the committed frontier board equals a regeneration of the committed tree',
    (t) => {
      // Regression: questArtifactPaths claimed the board is "dirty exactly when this
      // Quest's own landing made it stale" because every lifecycle command
      // regenerates it. False — autoCommitQuest is called from INSIDE the workflow
      // (loop.js, operator-workflow.js) while the CLI's refreshFrontierBoard runs
      // afterwards, so the on-disk board still predated this Quest's terminal event.
      // Either the board was clean and never entered the pathspec at all (the board
      // at HEAD kept listing the landed Quest as open, and the tree was left dirty),
      // or stale bytes from an earlier command got committed under this Quest.
      const root = tmp();
      initGit(root);
      const {quest, oracle} = makeQuest(root);
      runStep(root, quest);
      fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
      runStep(root, quest, {
        changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
        summary: 'scoped doc fix',
      });

      t.ok(autoCommitQuest(root, quest.id).committed, 'the Quest lands');

      const committedBoard = execFileSync(
        'git', ['show', `HEAD:${FRONTIER_BOARD_PATH}`],
        {cwd: root, encoding: 'utf8'});
      t.equal(committedBoard, runFrontierCommand(root),
        'the committed board is the board for the tree it was committed with');

      const status = execFileSync('git', ['status', '--porcelain', '-uall'],
        {cwd: root, encoding: 'utf8'});
      t.notMatch(status, /FRONTIER\.generated\.md/u,
        'landing leaves no board delta behind for a bookkeeping commit');

      fs.rmSync(root, {recursive: true, force: true});
      t.end();
    });

  t.test('a board that cannot be regenerated never strands a verified Quest', (t) => {
    // A board is a projection. Losing it must not leave a verified Quest with an
    // uncommitted tree, so regeneration failure is reported and stepped over.
    const root = tmp();
    initGit(root);
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped doc fix',
    });
    // Make the board path unwritable by turning it into a directory.
    fs.mkdirSync(path.join(root, FRONTIER_BOARD_PATH), {recursive: true});

    t.ok(autoCommitQuest(root, quest.id).committed,
      'the Quest still lands when the board cannot be written');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('index-lock contention is retried, not surfaced as a failure', (t) => {
    // git fails immediately rather than waiting on .git/index.lock, so two Quests
    // landing at once collide on a lock neither contends for semantically — their
    // pathspecs are disjoint. Measured on this repo: 15 of 60 invocations died.
    // A command that failed to take the lock did nothing, so retrying it is exact.
    const root = tmp();
    initGit(root);
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped doc fix',
    });
    // Hold the lock, and release it from a SEPARATE PROCESS: the retry backoff is a
    // synchronous Atomics.wait, so it blocks this thread's event loop and an
    // in-process timer could never fire.
    const lock = path.join(root, '.git', 'index.lock');
    fs.writeFileSync(lock, '');
    const releaser = spawn(process.execPath, ['-e',
      `setTimeout(() => require('node:fs').rmSync(${JSON.stringify(lock)}, ` +
      '{force: true}), 60)'], {detached: true, stdio: 'ignore'});
    releaser.unref();

    const committed = autoCommitQuest(root, quest.id);

    t.ok(committed.committed,
      'a landing that briefly loses the lock still commits');
    t.notOk(fs.existsSync(lock), 'the lock is gone afterwards');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an unyielding index lock yields a retryable skip, never a throw', (t) => {
    // The throw this replaces escaped the workflow AFTER the terminal event was
    // appended: Quest recorded solved, work uncommitted, tree dirty — the worst
    // state to hand an unattended supervisor. git-busy is recoverable by re-running.
    const root = tmp();
    initGit(root);
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped doc fix',
    });
    fs.writeFileSync(path.join(root, '.git', 'index.lock'), '');

    let outcome = null;
    t.doesNotThrow(() => {
      outcome = autoCommitQuest(root, quest.id);
    }, 'lock contention never escapes as an exception');
    t.equal(outcome.committed, false);
    t.equal(outcome.skipped, 'git-busy', 'the skip is typed and retryable');

    // Recoverable: once the lock clears, the same scope commits.
    fs.rmSync(path.join(root, '.git', 'index.lock'), {force: true});
    t.ok(autoCommitQuest(root, quest.id).committed,
      're-running after the lock clears commits the same scope');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('verbose successful hooks cannot exhaust the Git stderr buffer', (t) => {
    const root = tmp();
    initGit(root);
    const hooks = path.join(root, 'test-hooks');
    const hook = path.join(hooks, 'pre-commit');
    fs.mkdirSync(hooks, {recursive: true});
    fs.writeFileSync(hook, [
      '#!/usr/bin/env node',
      'process.stderr.write(\'x\'.repeat(2 * 1024 * 1024));',
      '',
    ].join('\n'));
    fs.chmodSync(hook, 0o755);
    execFileSync('git', ['config', 'core.hooksPath', hooks], {cwd: root});
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped doc fix',
    });

    t.ok(autoCommitQuest(root, quest.id).committed,
      'a successful hook may report more than the Node default buffer');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a non-lock git failure is still raised, never masked as git-busy', (t) => {
    // The retry must not swallow real git errors. A corrupt repo is not "busy".
    const root = tmp();
    initGit(root);
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped doc fix',
    });
    // Break HEAD so `git reset HEAD` fails for a reason that is not contention.
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/\n');

    t.throws(() => autoCommitQuest(root, quest.id),
      'a genuine git failure is raised, not reported as git-busy');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('auto-commit commits, nothing else — it never pushes', (t) => {
    const root = tmp();
    initGit(root);
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    // Default options, no remote configured: the commit happens and NO push is
    // attempted (so there is no push error to surface).
    const r = runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped doc fix',
    });
    t.notOk(r.commit.committed, 'attempt recording does not commit');
    const committed = autoCommitQuest(root, quest.id);
    t.ok(committed.committed, 'explicit terminal handoff commits');
    t.equal(committed.pushed, false, 'never pushes');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('terminal commit includes its oracle and leaves a sibling dirty', (t) => {
    const root = tmp();
    initGit(root);
    const {quest, oracle} = makeOwnedOracleQuest(root);
    const siblingOracle = path.join(root, 'solve/oracle/sibling.json');
    fs.writeFileSync(siblingOracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest);
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    runStep(root, quest, {
      changeRef: makeDiff(root, quest.id, 'fix', 'docs/demo.md'),
      summary: 'scoped doc fix',
    });

    const committed = autoCommitQuest(root, quest.id);
    t.ok(committed.committed, 'terminal handoff commits');
    t.ok(committedFiles(root).includes('solve/oracle/demo.json'),
      'commit contains the exact current Quest oracle');
    t.notOk(committedFiles(root).includes('solve/oracle/sibling.json'),
      'commit excludes the sibling oracle');
    const status = execFileSync('git', ['status', '--porcelain', '-uall'], {
      cwd: root,
      encoding: 'utf8',
    });
    t.match(status, /solve\/oracle\/sibling\.json/u,
      'sibling oracle remains visibly dirty');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('already-staged tracked deletion commits without unrelated staged work',
    (t) => {
      const root = tmp();
      initGit(root);
      fs.mkdirSync(path.join(root, 'docs'), {recursive: true});
      fs.mkdirSync(path.join(root, 'src'), {recursive: true});
      fs.writeFileSync(path.join(root, 'docs', 'deleted.md'), 'remove me\n');
      fs.writeFileSync(path.join(root, 'src', 'unrelated.js'), 'keep staged\n');
      execFileSync('git', ['add', 'docs/deleted.md'], {cwd: root});
      execFileSync('git', ['commit', '-m', 'track deletion target'], {cwd: root});
      const {quest, oracle} = makeQuest(root);
      runStep(root, quest);
      fs.rmSync(path.join(root, 'docs', 'deleted.md'));
      execFileSync('git', ['add', '--all', '--', 'docs/deleted.md'], {cwd: root});
      execFileSync('git', ['add', 'src/unrelated.js'], {cwd: root});
      fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));

      const result = runStep(root, quest, {
        changeRef: makeDiff(root, quest.id, 'delete', 'docs/deleted.md'),
        summary: 'delete tracked proof',
      });
      t.equal(result.commit.committed, false);
      t.equal(autoCommitQuest(root, quest.id).committed, true);
      t.equal(fs.existsSync(path.join(root, 'docs', 'deleted.md')), false);
      t.notOk(committedFiles(root).includes('src/unrelated.js'));
      const status = execFileSync('git', ['status', '--porcelain', '-uall'], {
        cwd: root,
        encoding: 'utf8',
      });
      t.match(status, /src\/unrelated\.js/u);
      fs.rmSync(root, {recursive: true, force: true});
      t.end();
    });

  t.test('an unverified source change suppresses the commit', (t) => {
    const root = tmp();
    initGit(root);
    const {quest} = makeQuest(root);
    // The quest finishes (metric 0) but the source change has no subagent
    // verification finding, so the commit gate is not met.
    runStep(root, quest);
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'export const demo = true;\n');
    execFileSync('git', ['add', '-N', 'src/demo.js'], {cwd: root});
    fs.writeFileSync(path.join(root, 'oracle.json'),
      JSON.stringify({metric: 0, target: 0}));
    const r = runStep(root, quest, {
      changeRef: makeCanonicalDiff(root, quest.id, 'fix', 'src/demo.js'),
      summary: 'unverified source change',
    });
    t.notOk(r.commit.committed, 'no commit when the source change is unverified');
    t.equal(r.commit.skipped, 'explicit-checkpoint-required',
      'points at the explicit checkpoint workflow');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an unbound legacy-style finding cannot approve a contracted source attempt', (t) => {
    const root = tmp();
    initGit(root);
    const {quest, oracle} = makeQuest(root);
    runStep(root, quest);
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.writeFileSync(path.join(root, 'src', 'demo.js'), 'export const demo = true;\n');
    execFileSync('git', ['add', '-N', 'src/demo.js'], {cwd: root});
    fs.writeFileSync(oracle, JSON.stringify({metric: 0, target: 0}));
    const r = runStep(root, quest, {
      changeRef: makeCanonicalDiff(root, quest.id, 'fix', 'src/demo.js'),
      summary: 'verified source change',
    });
    // Without a verification finding the commit is gated...
    t.notOk(r.commit.committed, 'gated before verification');
    // ...recording one and re-committing via the handoff path now passes the gate.
    appendFinding(root, quest.id, {
      frontier: `${quest.id}-main`,
      claim: 'subagent verified the source change against quest intent',
      evidence: 'subagent:verify-1',
    });
    const after = autoCommitQuest(root, quest.id);
    t.notOk(after.committed, 'content-free prose cannot unlock terminal handoff');
    t.equal(after.skipped, 'commit-gate');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
