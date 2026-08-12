import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import tap from 'tap';

import {CONFIGS} from '../../scripts/model-tlc-configs.js';
import {selectTlcConfigs} from '../../scripts/model-tlc.js';

const RUNNER_PATH = 'scripts/model-tlc.js';
const MODE_ARGUMENT = '--mode';
const TLC_CONFIG_ARGUMENT = '-config';
const WILDCARD_MODE = '*';
const DUPLICATE_MODE_PATTERN = /--mode may be provided exactly once/u;
const MISSING_MODE_PATTERN = /--mode requires one registered mode value/u;
const UNKNOWN_MODE_PATTERN = /unknown registered mode/u;
const NO_ERROR_OUTPUT = 'No error has been found';
const UTF8_ENCODING = 'utf8';
const FAKE_JAVA_NAME = 'java';
const FAKE_JAR_NAME = 'tla2tools.jar';
const INVOCATION_LOG_NAME = 'java-invocations.ndjson';
const INVOCATION_LOG_ENV = 'MODEL_TLC_INVOCATION_LOG';
const EXPECTED_OUTCOMES_ENV = 'MODEL_TLC_EXPECTED_OUTCOMES';
const EXECUTABLE_MODE = 0o755;
const FIXTURE_JAR_BYTES = 'fixture';
const LINE_SEPARATOR = '\n';
const JAVA_SOURCE =
  '#!/usr/bin/env node\n' +
  'const fs = require(\'node:fs\');\n' +
  'const args = process.argv.slice(2);\n' +
  `fs.appendFileSync(process.env.${INVOCATION_LOG_ENV}, ` +
    'JSON.stringify(args) + \'\\n\');\n' +
  `const outcomes = JSON.parse(process.env.${EXPECTED_OUTCOMES_ENV});\n` +
  `const config = args[args.indexOf('${TLC_CONFIG_ARGUMENT}') + 1];\n` +
  'const failure = outcomes[config];\n' +
  `process.stdout.write((failure || '${NO_ERROR_OUTPUT}') + '\\n');\n`;
const TEST_NAME = Object.freeze({
  exact: 'exact mode selection returns only the registered configuration',
  all: 'no mode selector preserves the complete registered corpus',
  cli: 'CLI runs only the exact selected configuration',
  cliAll: 'CLI without a selector runs every registered configuration',
  invalid: 'CLI rejects malformed and non-exact mode selectors before TLC',
});
const ASSERTION = Object.freeze({
  oneInvocation: 'exact selection launches TLC once',
  selectedConfig: 'the TLC invocation names only the selected config',
  allInvocations: 'the no-selector route launches every TLC configuration',
  allConfigs: 'the no-selector route preserves registered configuration order',
  noTlc: 'invalid selectors are rejected before Java starts',
});

function createCliFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-tlc-mode-'));
  const bin = path.join(root, 'bin');
  const java = path.join(bin, FAKE_JAVA_NAME);
  const jar = path.join(root, FAKE_JAR_NAME);
  const log = path.join(root, INVOCATION_LOG_NAME);
  fs.mkdirSync(bin, {recursive: true});
  fs.writeFileSync(java, JAVA_SOURCE);
  fs.chmodSync(java, EXECUTABLE_MODE);
  fs.writeFileSync(jar, FIXTURE_JAR_BYTES);
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  return {bin, jar, log};
}

function runCli(fixture, argv) {
  const outcomes = Object.fromEntries(CONFIGS.map((config) => [
    config.cfg,
    config.expectedFailurePattern || '',
  ]));
  return spawnSync(process.execPath, [RUNNER_PATH, ...argv], {
    cwd: process.cwd(),
    encoding: UTF8_ENCODING,
    env: {
      ...process.env,
      TLA_TOOLS_JAR: fixture.jar,
      [INVOCATION_LOG_ENV]: fixture.log,
      [EXPECTED_OUTCOMES_ENV]: JSON.stringify(outcomes),
      PATH: `${fixture.bin}${path.delimiter}${process.env.PATH}`,
    },
  });
}

function readInvocations(fixture) {
  if (!fs.existsSync(fixture.log)) return [];
  return fs.readFileSync(fixture.log, UTF8_ENCODING).trim().split(LINE_SEPARATOR)
    .filter(Boolean).map((line) => JSON.parse(line));
}

tap.test(TEST_NAME.exact, (t) => {
  const expected = CONFIGS.find((config) => config.expectConverged);
  t.same(selectTlcConfigs([MODE_ARGUMENT, expected.mode]), [expected]);
  t.end();
});

tap.test(TEST_NAME.all, (t) => {
  t.equal(selectTlcConfigs([]), CONFIGS);
  t.same(selectTlcConfigs([]).map((config) => config.mode),
    CONFIGS.map((config) => config.mode));
  t.end();
});

tap.test(TEST_NAME.cli, (t) => {
  const fixture = createCliFixture(t);
  const selected = CONFIGS.find((config) => config.expectConverged);
  const result = runCli(fixture, [MODE_ARGUMENT, selected.mode]);
  const invocations = readInvocations(fixture);

  t.equal(result.status, 0, result.stderr || result.stdout);
  t.equal(invocations.length, 1, ASSERTION.oneInvocation);
  t.ok(invocations[0].includes(selected.cfg), ASSERTION.selectedConfig);
  t.end();
});

tap.test(TEST_NAME.cliAll, (t) => {
  const fixture = createCliFixture(t);
  const result = runCli(fixture, []);
  const invocations = readInvocations(fixture);
  const invokedConfigs = invocations.map((argv) =>
    argv[argv.indexOf(TLC_CONFIG_ARGUMENT) + 1]);

  t.equal(result.status, 0, result.stderr || result.stdout);
  t.equal(invocations.length, CONFIGS.length, ASSERTION.allInvocations);
  t.same(invokedConfigs, CONFIGS.map((config) => config.cfg),
    ASSERTION.allConfigs);
  t.end();
});

tap.test(TEST_NAME.invalid, (t) => {
  const fixture = createCliFixture(t);
  const selected = CONFIGS.find((config) => config.expectConverged);
  const cases = [
    {argv: [MODE_ARGUMENT], pattern: MISSING_MODE_PATTERN},
    {
      argv: [MODE_ARGUMENT, selected.mode, MODE_ARGUMENT, selected.mode],
      pattern: DUPLICATE_MODE_PATTERN,
    },
    {argv: [MODE_ARGUMENT, 'not-registered'], pattern: UNKNOWN_MODE_PATTERN},
    {argv: [MODE_ARGUMENT, WILDCARD_MODE], pattern: UNKNOWN_MODE_PATTERN},
  ];
  for (const item of cases) {
    const result = runCli(fixture, item.argv);
    t.equal(result.status, 1);
    t.match(result.stderr, item.pattern);
  }
  t.same(readInvocations(fixture), [], ASSERTION.noTlc);
  t.end();
});
