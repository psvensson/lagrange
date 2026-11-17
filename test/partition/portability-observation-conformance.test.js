// The Q1a conformance wrapper is the solver probe for the representation
// proof. Every case runs the actual wrapper as a subprocess. A fake python3,
// first and alone on PATH, plays each way a reference invocation can fail to
// produce evidence; it tells the base corpus from a negative control by stdin.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDirectory, '../..');
const wrapper = path.join(repoRoot, 'scripts/checks/q1-partition-observation-conformance.js');
const fixturePath = path.join(testDirectory, 'portability-observation-v1.vectors.json');
const UTF8 = 'utf8';
const METRIC_FLAG = '--metric';
const EXECUTABLE_MODE = 0o755;
const FAKE_PYTHON = 'python3';
const BASE_CORPUS_FILE = 'base-corpus.json';
const PASS_MESSAGE = 'Q1a independent observation vectors and negative controls pass\n';
const CONTROL_COUNT = 12;
// Control 11 is the only mutation that claims identities[1] byte-equal.
const TARGET_CONTROL = 'negative control 11 (claim identities[1] byte-equal)';
const FIRST_CONTROL = 'negative control 1 (drop the last accepted vector)';
const BASE_INVOCATION = 'base corpus';
const INVOCATION_FAILED = 'Q1a reference invocation failed';
const ENV = Object.freeze({
  baseCorpus: 'Q1A_FAKE_BASE_CORPUS',
  base: 'Q1A_FAKE_BASE',
  target: 'Q1A_FAKE_TARGET',
  other: 'Q1A_FAKE_OTHER',
});
const FAKE_PYTHON_SOURCE = [
  `#!${process.execPath}`,
  '\'use strict\';',
  'const fs = require(\'node:fs\');',
  'const input = fs.readFileSync(0, \'utf8\');',
  `const isBase = input === fs.readFileSync(process.env.${ENV.baseCorpus}, 'utf8');`,
  'const isTarget = !isBase && JSON.parse(input).identities[1].equal === true;',
  `const role = isBase ? '${ENV.base}' : isTarget ? '${ENV.target}' : '${ENV.other}';`,
  'const behavior = JSON.parse(process.env[role]);',
  'if (behavior.unlinkSelf) fs.unlinkSync(__filename);',
  'fs.writeSync(1, behavior.stdout);',
  'fs.writeSync(2, behavior.stderr);',
  'if (behavior.signal !== null) process.kill(process.pid, behavior.signal);',
  'process.exit(behavior.status);',
  '',
].join('\n');

function behavior({stdout, stderr = '', status = 0, signal = null, unlinkSelf = false}) {
  return JSON.stringify({stdout, stderr, status, signal, unlinkSelf});
}

const VALID_ZERO = behavior({stdout: '0\n'});
const VALID_ONE = behavior({stdout: '1\n'});

// Each way one invocation can fail to be evidence, and how the wrapper must
// name it. Every mode except the spawn failure is reproducible per invocation.
const FAILURE_MODES = Object.freeze([
  ['is killed by a signal after printing 0',
    behavior({stdout: '0\n', signal: 'SIGKILL'}),
    'python3 was terminated by signal SIGKILL'],
  ['exits non-zero after printing 0',
    behavior({stdout: '0\n', stderr: 'reference exploded\n', status: 3}),
    'python3 exited with status 3; stderr "reference exploded\\n"'],
  ['prints nothing', behavior({stdout: ''}), 'python3 printed no metric'],
  ['prints abc', behavior({stdout: 'abc\n'}), 'python3 printed a malformed metric "abc\\n"'],
  ['prints -1', behavior({stdout: '-1\n'}), 'python3 printed a malformed metric "-1\\n"'],
  ['prints 1.5', behavior({stdout: '1.5\n'}), 'python3 printed a malformed metric "1.5\\n"'],
  ['prints 0 0', behavior({stdout: '0 0\n'}), 'python3 printed a malformed metric "0 0\\n"'],
  ['prints a zero-padded 00', behavior({stdout: '00\n'}),
    'python3 printed a malformed metric "00\\n"'],
  ['prints a 16-digit metric', behavior({stdout: '1000000000000000\n'}),
    'python3 printed a malformed metric "1000000000000000\\n"'],
  ['prints 0 but reports an ignored exception on stderr',
    behavior({stdout: '0\n', stderr: 'Exception ignored in atexit callback\n'}),
    'python3 exited 0 but wrote to stderr; stderr "Exception ignored in atexit callback\\n"'],
]);

function fakePythonFixture(t, {withPython = true} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'q1a-conformance-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  if (withPython) {
    fs.writeFileSync(path.join(bin, FAKE_PYTHON), FAKE_PYTHON_SOURCE);
    fs.chmodSync(path.join(bin, FAKE_PYTHON), EXECUTABLE_MODE);
  }
  const baseCorpus = path.join(root, BASE_CORPUS_FILE);
  fs.writeFileSync(baseCorpus,
    JSON.stringify(JSON.parse(fs.readFileSync(fixturePath, UTF8))));
  return {bin, baseCorpus};
}

// A fresh fake per run: a fake may delete itself during one run.
function runWrapper(t, args, roles, options) {
  const fixture = fakePythonFixture(t, options);
  return spawnSync(process.execPath, [wrapper, ...args], {
    cwd: repoRoot, encoding: UTF8,
    env: {
      ...process.env,
      PATH: fixture.bin,
      [ENV.baseCorpus]: fixture.baseCorpus,
      [ENV.base]: roles.base,
      [ENV.target]: roles.target,
      [ENV.other]: roles.other,
    },
  });
}

// Both the solver probe (--metric) and the human run must fail, with the
// metric counted and the failing invocation named in the output.
function assertProofFails(t, roles, {metric, finding, options}) {
  const probe = runWrapper(t, [METRIC_FLAG], roles, options);
  assert.equal(probe.signal, null);
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout, `${metric}\n`, probe.stderr);
  assert.ok(probe.stderr.includes(finding), probe.stderr);
  const human = runWrapper(t, [], roles, options);
  assert.equal(human.signal, null);
  assert.equal(human.status, 1, human.stderr);
  assert.equal(human.stdout, '');
  assert.ok(human.stderr.includes(finding), human.stderr);
  assert.ok(human.stderr.includes(
    `Q1a conformance proof failed: metric ${metric}, target 0\n`), human.stderr);
}

test('the real Python reference passes the corpus and every negative control', () => {
  for (const [args, stdout] of [[[], PASS_MESSAGE], [[METRIC_FLAG], '0\n']]) {
    const result = spawnSync(process.execPath, [wrapper, ...args],
      {cwd: repoRoot, encoding: UTF8});
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, stdout);
    assert.equal(result.stderr, '');
  }
});

test('python3 absent from PATH fails the proof at the base corpus', (t) => {
  assertProofFails(t, {base: VALID_ZERO, target: VALID_ONE, other: VALID_ONE}, {
    metric: 1, options: {withPython: false},
    finding: `${INVOCATION_FAILED}: ${BASE_INVOCATION}: ` +
      'python3 did not run to completion: spawnSync python3 ENOENT',
  });
});

test('python3 that disappears after the base corpus fails every negative control', (t) => {
  assertProofFails(t, {
    base: behavior({stdout: '0\n', unlinkSelf: true}), target: VALID_ONE, other: VALID_ONE,
  }, {
    metric: CONTROL_COUNT,
    finding: `${INVOCATION_FAILED}: ${FIRST_CONTROL}: ` +
      'python3 did not run to completion: spawnSync python3 ENOENT',
  });
});

for (const [mode, misbehavior, how] of FAILURE_MODES) {
  test(`a base-corpus reference that ${mode} fails the proof`, (t) => {
    assertProofFails(t, {base: misbehavior, target: VALID_ONE, other: VALID_ONE}, {
      metric: 1, finding: `${INVOCATION_FAILED}: ${BASE_INVOCATION}: ${how}`,
    });
  });

  test(`one negative control whose reference ${mode} fails the proof`, (t) => {
    assertProofFails(t, {base: VALID_ZERO, target: misbehavior, other: VALID_ONE}, {
      metric: 1, finding: `${INVOCATION_FAILED}: ${TARGET_CONTROL}: ${how}`,
    });
  });
}

test('a negative control the reference accepts with a valid metric 0 fails the proof', (t) => {
  assertProofFails(t, {base: VALID_ZERO, target: VALID_ZERO, other: VALID_ONE}, {
    metric: 1, finding: `Q1a negative control accepted: ${TARGET_CONTROL}: ` +
      'the reference reported metric 0 for the mutated corpus',
  });
});

test('valid base-corpus deficits are counted as representation deficits', (t) => {
  assertProofFails(t, {base: behavior({stdout: '4\n'}), target: VALID_ONE, other: VALID_ONE}, {
    metric: 4, finding: 'Q1a representation deficits in the base corpus: 4',
  });
});
