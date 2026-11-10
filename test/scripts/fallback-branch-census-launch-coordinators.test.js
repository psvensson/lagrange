import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';

import {collectRun} from '../../scripts/checks/fallback-branch-census.js';
import {
  accountWitnesses,
  isValidCoveragePayload,
} from '../../scripts/checks/fallback-branch-census-witnesses.js';
import {isClauseInstrumented} from '../../scripts/checks/fallback-branch-census-shell.js';
import {flushCoverageBeforeKill} from '../../scripts/checks/census-pre-kill-flush.js';
import {CENSUS_COVERAGE_DIR_ENV} from '../../scripts/checks/fallback-branch-census-constants.js';

const COMMIT = '1ad04d21a0000000000000000000000000000000';

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'census-coordinators-'));
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.mkdirSync(path.join(root, 'test'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'subject.js'),
    'export const choose = (a, b) => a || b;\n');
  return root;
}

test('isolated node --test coordinator reconciles against instrumented children and fails closed when stripped',
  () => {
    const root = makeTempRoot();
    const subjectUrl = pathToFileURL(path.join(root, 'src', 'subject.js')).href;
    const childTest = path.join(root, 'test', 'child.test.mjs');
    fs.writeFileSync(childTest, [
      'import assert from \'node:assert/strict\';',
      'import {test} from \'node:test\';',
      `import {choose} from ${JSON.stringify(subjectUrl)};`,
      'test(\'runs\', () => { assert.equal(choose(1, 2), 1); });',
    ].join('\n'));

    const cleanDriver = path.join(root, 'test', 'driver-clean.mjs');
    fs.writeFileSync(cleanDriver, [
      'import {spawnSync} from \'node:child_process\';',
      'const cleanEnv = {...process.env};',
      'delete cleanEnv.NODE_TEST_CONTEXT;',
      `const res = spawnSync(process.execPath, ['--test', ${JSON.stringify(childTest)}],`,
      '  {env: cleanEnv, encoding: \'utf8\'});',
      'if (res.status !== 0) throw new Error(res.stderr);',
    ].join('\n'));
    const cleanOut = path.join(root, 'out-clean');
    const cleanRecord = collectRun({
      lane: 'bootstrap',
      out: cleanOut,
      root,
      command: [process.execPath, cleanDriver],
      host: 'fixture',
      commit: COMMIT,
    });
    assert.deepEqual(
      [cleanRecord.exitCode, cleanRecord.witnesses.lost.length],
      [0, 0],
    );

    const badDriver = path.join(root, 'test', 'driver-bad.mjs');
    fs.writeFileSync(badDriver, [
      'import {spawnSync} from \'node:child_process\';',
      `spawnSync(process.execPath, ['--test', ${JSON.stringify(childTest)}],`,
      '  {env: {...process.env, NODE_OPTIONS: \'\', NODE_V8_COVERAGE: \'\'}});',
      `spawnSync(process.execPath, ['--test', ${JSON.stringify(childTest)}],`,
      '  {env: {...process.env, NODE_TEST_CONTEXT: \'child-v8\'}});',
    ].join('\n'));
    const badOut = path.join(root, 'out-bad');
    const badRecord = collectRun({
      lane: 'bootstrap',
      out: badOut,
      root,
      command: [process.execPath, badDriver],
      host: 'fixture',
      commit: COMMIT,
    });
    assert.equal(badRecord.exitCode, 0);
    assert.equal(badRecord.witnesses.lost.length, 2);
    for (const lost of badRecord.witnesses.lost) {
      assert.deepEqual([lost.uninstrumented, lost.cause], [true, 'uninstrumented']);
    }
  });

test('file-backed worker immediate terminate and unref complete cleanly while stripped worker fails closed',
  () => {
    const root = makeTempRoot();
    const subjectUrl = pathToFileURL(path.join(root, 'src', 'subject.js')).href;
    const workerScript = path.join(root, 'test', 'worker-entry.mjs');
    fs.writeFileSync(workerScript, `await import(${JSON.stringify(subjectUrl)});\n`);

    const okDriver = path.join(root, 'test', 'worker-ok.mjs');
    fs.writeFileSync(okDriver, [
      'import {Worker} from \'node:worker_threads\';',
      `const w1 = new Worker(${JSON.stringify(workerScript)});`,
      'await w1.terminate();',
      `const w2 = new Worker(${JSON.stringify(workerScript)});`,
      'w2.unref();',
    ].join('\n'));
    const okOut = path.join(root, 'worker-ok');
    const okRecord = collectRun({
      lane: 'unit',
      out: okOut,
      root,
      command: [process.execPath, okDriver],
      host: 'fixture',
      commit: COMMIT,
    });
    assert.deepEqual(
      [okRecord.exitCode, okRecord.witnesses.started, okRecord.witnesses.complete,
        okRecord.witnesses.lost.length],
      [0, 3, 3, 0],
    );

    const strippedDriver = path.join(root, 'test', 'worker-stripped.mjs');
    fs.writeFileSync(strippedDriver, [
      'import {Worker} from \'node:worker_threads\';',
      `const w = new Worker(${JSON.stringify(workerScript)}, {env: {PATH: process.env.PATH}});`,
      'await w.terminate();',
    ].join('\n'));
    const strippedOut = path.join(root, 'worker-stripped');
    const strippedRecord = collectRun({
      lane: 'unit',
      out: strippedOut,
      root,
      command: [process.execPath, strippedDriver],
      host: 'fixture',
      commit: COMMIT,
    });
    assert.equal(strippedRecord.witnesses.lost.length, 1);
    assert.deepEqual(
      [strippedRecord.witnesses.lost[0].uninstrumented, strippedRecord.witnesses.lost[0].cause],
      [true, 'uninstrumented'],
    );
  });

test('preload launch and witness hooks survive post-import Array and Set intrinsic mutations',
  () => {
    const root = makeTempRoot();
    const driver = path.join(root, 'test', 'intrinsic-mutation-driver.mjs');
    fs.writeFileSync(driver, [
      'import assert from \'node:assert/strict\';',
      'import {execFileSync, spawnSync} from \'node:child_process\';',
      'const origArrayIterator = Array.prototype[Symbol.iterator];',
      'const origSetAdd = Set.prototype.add;',
      'const origSetIterator = Set.prototype[Symbol.iterator];',
      'const origMatchAll = String.prototype.matchAll;',
      'const stringIncludes = Function.call.bind(String.prototype.includes);',
      'const stringSplit = Function.call.bind(String.prototype.split);',
      'let gitRes;',
      'let gitExecFile;',
      'let nodeRes;',
      'let nodeExecFile;',
      'try {',
      '  Reflect.set(Set.prototype, \'add\', function add() {',
      '    throw new Error(\'Set.prototype.add should not be consulted\');',
      '  });',
      '  Reflect.set(Set.prototype, Symbol.iterator, function iterator() {',
      '    throw new Error(\'Set.prototype[Symbol.iterator] should not be consulted\');',
      '  });',
      '  Reflect.set(String.prototype, \'matchAll\', function matchAll() {',
      '    throw new Error(\'String.prototype.matchAll should not be consulted\');',
      '  });',
      '  Reflect.set(Array.prototype, Symbol.iterator, function emptyIterator() {',
      '    return {next: () => ({done: true})};',
      '  });',
      '  gitRes = spawnSync(\'git\', [\'--version\'], {encoding: \'utf8\'});',
      '  gitExecFile = execFileSync(\'git\', [\'--version\'], {encoding: \'utf8\'});',
      '  // Node child_process normalizeSpawnArguments iterates ObjectKeys(env) via for..of;',
      '  // fail closed if any frame outside node:child_process consults Array[Symbol.iterator].',
      '  Reflect.set(Array.prototype, Symbol.iterator, function guardedIterator() {',
      '    const callerFrame = stringSplit(new Error().stack, \'\\n\')[2] || \'\';',
      '    if (stringIncludes(callerFrame, \'node:child_process:\')) {',
      '      return Reflect.apply(origArrayIterator, this, []);',
      '    }',
      '    throw new Error(`Unexpected Array[Symbol.iterator] call: ${callerFrame}`);',
      '  });',
      '  nodeRes = spawnSync(process.execPath, [\'-e\', \'process.stdout.write("child-ok")\'],',
      '    {encoding: \'utf8\'});',
      '  nodeExecFile = execFileSync(process.execPath,',
      '    [\'-e\', \'process.stdout.write("execfile-ok")\'], {encoding: \'utf8\'});',
      '} finally {',
      '  Reflect.set(Array.prototype, Symbol.iterator, origArrayIterator);',
      '  Reflect.set(Set.prototype, \'add\', origSetAdd);',
      '  Reflect.set(Set.prototype, Symbol.iterator, origSetIterator);',
      '  Reflect.set(String.prototype, \'matchAll\', origMatchAll);',
      '}',
      'assert.equal(gitRes.status, 0);',
      'assert.match(gitRes.stdout, /^git version/u);',
      'assert.match(gitExecFile, /^git version/u);',
      'assert.equal(nodeRes.status, 0);',
      'assert.equal(nodeRes.stdout, \'child-ok\');',
      'assert.equal(nodeExecFile, \'execfile-ok\');',
    ].join('\n'));

    const out = path.join(root, 'intrinsic-mutation-out');
    const record = collectRun({
      lane: 'unit',
      out,
      root,
      command: [process.execPath, driver],
      host: 'fixture',
      commit: COMMIT,
    });
    assert.deepEqual(
      [record.exitCode, record.witnesses.started, record.witnesses.complete,
        record.witnesses.lost.length],
      [0, 3, 3, 0],
    );
  });

test('nested unref sub-worker spawned right before parent worker terminate completes cleanly',
  () => {
    const root = makeTempRoot();
    const subjectUrl = pathToFileURL(path.join(root, 'src', 'subject.js')).href;
    const nestedWorker = path.join(root, 'test', 'nested-worker.mjs');
    fs.writeFileSync(nestedWorker, [
      `import {choose} from ${JSON.stringify(subjectUrl)};`,
      'choose(0, 2);',
      'setInterval(() => {}, 1000);',
    ].join('\n'));

    const outerWorker = path.join(root, 'test', 'outer-worker.mjs');
    fs.writeFileSync(outerWorker, [
      'import {Worker, parentPort} from \'node:worker_threads\';',
      `import {choose} from ${JSON.stringify(subjectUrl)};`,
      'choose(1, 2);',
      `const w2 = new Worker(${JSON.stringify(nestedWorker)}, {execArgv: []});`,
      'w2.unref();',
      'parentPort.postMessage(\'ready\');',
      'setInterval(() => {}, 1000);',
    ].join('\n'));

    const driver = path.join(root, 'test', 'nested-terminate-driver.mjs');
    fs.writeFileSync(driver, [
      'import {once} from \'node:events\';',
      'import {Worker} from \'node:worker_threads\';',
      `const w1 = new Worker(${JSON.stringify(outerWorker)});`,
      'await once(w1, \'message\');',
      'await w1.terminate();',
    ].join('\n'));

    const out = path.join(root, 'nested-terminate-out');
    const record = collectRun({
      lane: 'unit',
      out,
      root,
      command: [process.execPath, driver],
      host: 'fixture',
      commit: COMMIT,
    });
    assert.deepEqual(
      [record.exitCode, record.witnesses.started, record.witnesses.complete,
        record.witnesses.lost.length],
      [0, 3, 3, 0],
    );
  });

function coveragePayload(urls) {
  return {
    result: urls.map((url, index) => ({
      scriptId: String(index + 1),
      url,
      functions: [{functionName: '', ranges: [{startOffset: 0, endOffset: 10, count: 1}]}],
    })),
  };
}

function writeMainProcessWitness(dir, pid) {
  fs.writeFileSync(path.join(dir, `witness-${pid}-0.json`), JSON.stringify({
    pid, threadId: 0, ppid: 1, entry: '/repo/test/entry.test.js',
    cwd: '/repo', startedAt: '2026-11-09T23:26:15.000Z', isMainThread: true,
  }));
  fs.writeFileSync(path.join(dir, `witness-${pid}-0-exit.json`), JSON.stringify({
    complete: true, by: 'exit', exitCode: 0, at: '2026-11-09T23:26:16.000Z',
  }));
  const writtenAtMs = Date.parse('2026-11-09T23:26:16.100Z');
  fs.writeFileSync(path.join(dir, `coverage-${pid}-${writtenAtMs}-0.json`),
    JSON.stringify(coveragePayload(['file:///repo/test/entry.test.js'])));
}

function runInternalWorkerScenario(t, configure) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-internal-worker-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  configure(dir);
  return accountWitnesses(dir, fs.readdirSync(dir));
}

test('mid-bootstrap node:*-only internal worker reconciles while adversarial shapes fail closed',
  (t) => {
    const pid = 4075479;
    const flushMs = Date.parse('2026-11-09T23:26:16.256Z');
    const builtins = ['node:internal/per_context/primordials', 'node:internal/bootstrap/realm'];

    const reconciled = runInternalWorkerScenario(t, (dir) => {
      writeMainProcessWitness(dir, pid);
      fs.writeFileSync(path.join(dir, `coverage-${pid}-${flushMs}-5.json`),
        JSON.stringify(coveragePayload(builtins)));
    });
    assert.deepEqual(
      [reconciled.started, reconciled.complete, reconciled.lost],
      [1, 1, []],
    );

    const negativeCases = [
      ['empty result', (dir) => {
        writeMainProcessWitness(dir, pid);
        fs.writeFileSync(path.join(dir, `coverage-${pid}-${flushMs}-5.json`),
          JSON.stringify({result: []}));
      }, 5],
      ['eval script url', (dir) => {
        writeMainProcessWitness(dir, pid);
        fs.writeFileSync(path.join(dir, `coverage-${pid}-${flushMs}-5.json`),
          JSON.stringify(coveragePayload([...builtins, ''])));
      }, 5],
      ['repository file url', (dir) => {
        writeMainProcessWitness(dir, pid);
        fs.writeFileSync(path.join(dir, `coverage-${pid}-${flushMs}-5.json`),
          JSON.stringify(coveragePayload([...builtins, 'file:///repo/src/subject.js'])));
      }, 5],
      ['later flush with repository file url', (dir) => {
        writeMainProcessWitness(dir, pid);
        fs.writeFileSync(path.join(dir, `coverage-${pid}-${flushMs}-5.json`),
          JSON.stringify(coveragePayload(builtins)));
        fs.writeFileSync(path.join(dir, `coverage-${pid}-${flushMs + 10}-5.json`),
          JSON.stringify(coveragePayload(['file:///repo/src/subject.js'])));
      }, 5],
      ['rostered worker thread', (dir) => {
        writeMainProcessWitness(dir, pid);
        fs.writeFileSync(path.join(dir, `roster-${pid}-5.json`),
          JSON.stringify({pid, threadId: 5, kind: 'worker'}));
        fs.writeFileSync(path.join(dir, `coverage-${pid}-${flushMs}-5.json`),
          JSON.stringify(coveragePayload(builtins)));
      }, 5],
      ['missing main-thread start marker', (dir) => {
        fs.writeFileSync(path.join(dir, `coverage-${pid}-${flushMs}-5.json`),
          JSON.stringify(coveragePayload(builtins)));
      }, 5],
      ['uninstrumented main thread', (dir) => {
        fs.writeFileSync(path.join(dir, `coverage-${pid}-${flushMs}-0.json`),
          JSON.stringify(coveragePayload(builtins)));
      }, 0],
    ];

    for (const [label, setup, expectedThreadId] of negativeCases) {
      const accounted = runInternalWorkerScenario(t, setup);
      assert.equal(accounted.lost.length, 1, label);
      assert.deepEqual(
        [accounted.lost[0].pid, accounted.lost[0].threadId,
          accounted.lost[0].uninstrumented, accounted.lost[0].cause],
        [pid, expectedThreadId, true, 'uninstrumented'],
        label,
      );
    }
  });

test('witness accounting, shell instrumentation check, and pre-kill flush ignore Object.prototype pollution',
  (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-proto-pollution-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));

    const flushMs = Date.parse('2026-11-09T23:26:16.256Z');
    // 910: empty {} start marker + coverage (must NOT inherit pid/threadId from Object.prototype)
    fs.writeFileSync(path.join(dir, 'witness-910-0.json'), '{}');
    fs.writeFileSync(path.join(dir, `coverage-910-${flushMs}-0.json`),
      JSON.stringify(coveragePayload(['file:///repo/test/entry.test.js'])));
    // 911: valid start + request + empty {} flushed ack (must NOT inherit final/id)
    fs.writeFileSync(path.join(dir, 'witness-911-0.json'), JSON.stringify({
      pid: 911, threadId: 0, ppid: 1, entry: '/repo/test/kill.test.js',
      cwd: '/repo', startedAt: '2026-11-09T23:26:15.000Z', isMainThread: true,
    }));
    fs.writeFileSync(path.join(dir, 'witness-911-0-flush-request.json'), '{"id":"req-911"}');
    fs.writeFileSync(path.join(dir, 'witness-911-0-flushed.json'), '{}');
    fs.writeFileSync(path.join(dir, `coverage-911-${flushMs}-0.json`),
      JSON.stringify(coveragePayload(['file:///repo/test/kill.test.js'])));
    // 912: valid start + empty {} coverage payload (must NOT inherit result from Object.prototype)
    fs.writeFileSync(path.join(dir, 'witness-912-0.json'), JSON.stringify({
      pid: 912, threadId: 0, ppid: 1, entry: '/repo/test/badcov.test.js',
      cwd: '/repo', startedAt: '2026-11-09T23:26:15.000Z', isMainThread: true,
    }));
    fs.writeFileSync(path.join(dir, `coverage-912-${flushMs}-0.json`), '{}');

    const pollutionEntries = [
      ['pid', 910],
      ['threadId', 0],
      ['final', true],
      ['id', 'req-911'],
      ['result', [{url: 'file:///repo/test/badcov.test.js', functions: []}]],
      ['url', 'file:///repo/test/badcov.test.js'],
      ['functions', []],
      ['ranges', []],
      ['startOffset', 0],
      ['endOffset', 1],
      ['count', 1],
      ['NODE_V8_COVERAGE', dir],
      ['NODE_OPTIONS', '--import /repo/scripts/checks/fallback-branch-census-preload.js'],
      [CENSUS_COVERAGE_DIR_ENV, dir],
      ['999:0', {pid: '999', threadId: '0', marker: {pid: 999, threadId: 0}}],
    ];
    const inherited = Object.getPrototypeOf({});
    for (const [key, value] of pollutionEntries) {
      Object.defineProperty(inherited, key, {
        value,
        configurable: true,
        writable: true,
        enumerable: true,
      });
    }
    try {
      assert.equal(isValidCoveragePayload({}), false);
      assert.equal(isValidCoveragePayload({result: [{}]}), false);
      assert.equal(isValidCoveragePayload({result: [{url: 'file:///a.js', functions: [{}]}]}),
        false);
      assert.equal(isValidCoveragePayload({
        result: [{url: 'file:///a.js', functions: [{ranges: [{}]}]}],
      }), false);
      assert.equal(isClauseInstrumented({}), false);
      assert.equal(flushCoverageBeforeKill(999999, 'SIGKILL', {env: {}}), false);

      const accounted = accountWitnesses(dir, fs.readdirSync(dir).sort());
      assert.equal(accounted.complete, 0);
      assert.deepEqual(
        accounted.lost.map((w) => [w.pid, w.cause]),
        [
          [910, 'unknown'],
          [911, 'pre-kill-flush-unanswered'],
          [912, 'unreadable-coverage'],
        ],
      );
    } finally {
      for (const [key] of pollutionEntries) {
        delete inherited[key];
      }
    }
  });
