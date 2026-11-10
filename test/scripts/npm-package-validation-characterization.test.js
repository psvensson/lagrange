import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validatePackageObservation} from '../../scripts/npm-package-observation.js';

// Fixed wire examples characterized against 41c73dc. These deliberately do not
// use the producer to build the validator's expected results.
const SCHEMA = 'npm-package-observation/1';
const WALL_TIME = '2026-11-08T00:00:00.000Z';
const OVERHEAD_SCOPE = 'setup-records-and-snapshots-before-terminal-write';
const REQUIRED = ['install'];
const TERMINAL = {schema: SCHEMA, sequence: 6, wallTime: WALL_TIME, elapsedMs: 6,
  event: 'terminal', kind: 'terminal', outcome: 'complete', failures: '',
  overheadMs: 0, overheadScope: OVERHEAD_SCOPE};

function records() {
  const fields = [
    {event: 'begin', kind: 'session', stage: 'observation-session',
      stageId: 1, parentStageId: null},
    {event: 'begin', kind: 'command', stage: 'install', stageId: 2, parentStageId: 1},
    {event: 'end', kind: 'command', stage: 'install', stageId: 2, parentStageId: 1,
      outcome: 'success', durationMs: 1, status: 0, signal: null, errorCode: null},
    {event: 'snapshot', kind: 'snapshot', artifact: 'installed-lock', parentStageId: 1,
      snapshotOutcome: 'optional-missing', bytes: 0},
    {event: 'end', kind: 'session', stage: 'observation-session', stageId: 1,
      parentStageId: null, outcome: 'success', durationMs: 4},
  ];
  return [...fields.map((record, index) => ({schema: SCHEMA, sequence: index + 1,
    wallTime: WALL_TIME, elapsedMs: index + 1, ...record})), {...TERMINAL}];
}

const textOf = (values) => `${values.map((value) => JSON.stringify(value)).join('\n')}\n`;
const result = (reasons, terminal = null) => ({complete: reasons.length === 0, reasons, terminal});

function changed(index, fields) {
  const values = records();
  values[index] = {...values[index], ...fields};
  return textOf(values);
}

const CASES = [
  ['valid optional snapshot', () => textOf(records()), result([], TERMINAL)],
  ['truncated valid trace', () => textOf(records()).slice(0, -1),
    result(['truncated-trace'], TERMINAL)],
  ['missing terminal', () => textOf(records().slice(0, -1)), result(['missing-terminal'])],
  ['sequence before event checks', () => changed(1, {sequence: 1, event: 'unknown'}),
    result(['invalid-record-or-sequence', 'open-stages', 'missing-terminal',
      'missing-required-stage:install'])],
  ['duplicate stage identity', () => changed(1, {stageId: 1}),
    result(['invalid-stage-begin', 'open-stages', 'missing-terminal',
      'missing-required-stage:install'])],
  ['stage identity before command outcome', () => changed(2, {stageId: 99, status: -1}),
    result(['invalid-stage-end', 'open-stages', 'missing-terminal',
      'missing-required-stage:install'])],
  ['command stage is recorded before outcome rejection', () => changed(2, {status: -1}),
    result(['invalid-command-outcome', 'open-stages', 'missing-terminal'])],
  ['session stack pops before invalid end rejection', () => changed(4, {durationMs: -1}),
    result(['invalid-stage-end', 'missing-terminal'])],
  ['incomplete required snapshot', () => changed(3,
    {artifact: 'installed-package', snapshotOutcome: 'missing'}),
  result(['snapshot-incomplete'], TERMINAL)],
  ['invalid snapshot fields before incomplete outcome', () => changed(3,
    {artifact: 'installed-package', snapshotOutcome: 'missing', bytes: 1}),
  result(['invalid-snapshot', 'open-stages', 'missing-terminal'])],
  ['terminal validation before retaining it', () => changed(5, {overheadMs: -1}),
    result(['invalid-terminal', 'missing-terminal'])],
  ['retain incomplete terminal', () => changed(5, {outcome: 'incomplete', failures: 'sink'}),
    result(['observation-incomplete'], {...TERMINAL, outcome: 'incomplete', failures: 'sink'})],
  ['retain terminal before later record rejection', () => textOf([...records(), TERMINAL]),
    result(['record-after-terminal'], TERMINAL)],
];

for (const [name, input, expected] of CASES) {
  test(`package validation preserves complete result: ${name}`, () => {
    assert.deepEqual(validatePackageObservation(input(), {requiredStages: REQUIRED}), expected);
  });
}

test('JSON parsing precedes the already-seen terminal guard', () => {
  let nativeMessage;
  try {
    JSON.parse('}');
  } catch (error) {
    nativeMessage = error.message;
  }
  assert.deepEqual(validatePackageObservation(`${textOf(records())}}\n`),
    result([nativeMessage], TERMINAL));
});

test('rejection order retains truncation, first failure, open spans and repeated requirements', () => {
  const input = records().slice(0, 2);
  input[1].schema = 'wrong';
  assert.deepEqual(validatePackageObservation(textOf(input).slice(0, -1),
    {requiredStages: ['absent', 'install', 'absent']}),
  result(['truncated-trace', 'invalid-record-or-sequence', 'open-stages', 'missing-terminal',
    'missing-required-stage:absent', 'missing-required-stage:install',
    'missing-required-stage:absent']));
});

test('invalid trace type returns before requested-stage validation', () => {
  assert.deepEqual(validatePackageObservation(null, {requiredStages: REQUIRED}),
    result(['invalid-trace-size']));
});
