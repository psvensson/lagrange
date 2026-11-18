import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {
  formatCpuProfileSummary,
  main,
  summarizeCpuProfile,
} from '../../scripts/summarize-cpu-profile.js';

function frame(functionName, url, lineNumber) {
  return {functionName, url, lineNumber, columnNumber: 0, scriptId: '1'};
}

// (root) -> handleMessage [router] -> encode [encoding]      40 ms self
//                                  -> planMoves [planner]    10 ms self
//                                       -> encode [encoding] 30 ms self
//        -> (idle)                                           15 ms
//        -> (garbage collector)                               5 ms
// handleMessage itself has no self time.
const PROFILE = Object.freeze({
  nodes: [
    {id: 1, callFrame: frame('(root)', '', -1), children: [2, 6, 7]},
    {id: 2, callFrame: frame('handleMessage',
      'file:///app/src/transport/message-router.js', 99), children: [3, 4]},
    {id: 3, callFrame: frame('encode',
      'file:///app/src/transport/message-router-delivery-encoding.js', 11)},
    {id: 4, callFrame: frame('planMoves',
      'file:///app/src/rebalancer/move-planner.js', 41), children: [5]},
    {id: 5, callFrame: frame('encode',
      'file:///app/src/transport/message-router-delivery-encoding.js', 11)},
    {id: 6, callFrame: frame('(idle)', '', -1)},
    {id: 7, callFrame: frame('(garbage collector)', '', -1)},
  ],
  startTime: 0,
  endTime: 100000,
  samples: [3, 3, 4, 5, 6, 7],
  timeDeltas: [25000, 15000, 10000, 30000, 15000, 5000],
});
const ROUTER = 'src/transport/message-router.js';
const ENCODING = 'src/transport/message-router-delivery-encoding.js';
const PLANNER = 'src/rebalancer/move-planner.js';

test('self time is summed per function across its call sites', () => {
  const summary = summarizeCpuProfile(PROFILE);
  assert.equal(summary.samples, 6);
  assert.equal(summary.sampledMs, 100);
  assert.equal(summary.idleMs, 15);
  assert.equal(summary.busyMs, 85);
  assert.equal(summary.garbageCollectorMs, 5);
  assert.deepEqual(summary.topSelfFunctions.slice(0, 3), [
    {name: 'encode', file: ENCODING, line: 12, ms: 70, percent: 82.4},
    {name: 'planMoves', file: PLANNER, line: 42, ms: 10, percent: 11.8},
    {name: '(garbage collector)', file: '(native)', line: null, ms: 5, percent: 5.9},
  ]);
  assert.equal(summary.topSelfFunctions.some((entry) => entry.name === 'handleMessage'), false,
    'a function with no self time is not a self-time entry');
  assert.equal(summary.topSelfFunctions.some((entry) => entry.name === '(idle)'), false);
});

test('inclusive time counts a file once per sample it is on the stack of', () => {
  const summary = summarizeCpuProfile(PROFILE);
  const inclusive = Object.fromEntries(
    summary.topInclusiveFiles.map((entry) => [entry.file, entry.ms]));
  assert.equal(inclusive[ROUTER], 80, 'the router is above every code sample');
  assert.equal(inclusive[ENCODING], 70);
  assert.equal(inclusive[PLANNER], 40, 'the planner and what it called');
  assert.deepEqual(summary.topSelfFiles.map((entry) => [entry.file, entry.ms]),
    [[ENCODING, 70], [PLANNER, 10], ['(native)', 5]]);
});

test('call paths separate who called the hot file', () => {
  const summary = summarizeCpuProfile(PROFILE);
  assert.deepEqual(summary.topCallPathsByFile.map((entry) => [entry.path, entry.ms]), [
    [`${ROUTER} > ${ENCODING}`, 40],
    [`${ROUTER} > ${PLANNER} > ${ENCODING}`, 30],
    [`${ROUTER} > ${PLANNER}`, 10],
    ['(native)', 5],
  ]);
  // A depth of one keeps only the running file.
  assert.deepEqual(summarizeCpuProfile(PROFILE, {pathDepth: 1}).topCallPathsByFile[0],
    {path: ENCODING, ms: 70, percent: 82.4});
  assert.equal(summarizeCpuProfile(PROFILE, {top: 1}).topSelfFunctions.length, 1);
});

test('dependency and internal files keep a readable name', () => {
  const summary = summarizeCpuProfile({
    nodes: [
      {id: 1, callFrame: frame('(root)', '', -1), children: [2, 3]},
      {id: 2, callFrame: frame('send', 'file:///app/node_modules/ws/lib/sender.js', 3)},
      {id: 3, callFrame: frame('', 'node:internal/timers', 5)},
    ],
    samples: [2, 3],
    timeDeltas: [2000, 1000],
  });
  assert.deepEqual(summary.topSelfFunctions.map((entry) => [entry.name, entry.file]),
    [['send', 'node_modules/ws/lib/sender.js'], ['(anonymous)', 'node:internal/timers']]);
});

test('the command prints the text summary, or json, and states its usage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'summarize-cpu-profile-'));
  try {
    const file = join(directory, 'node.cpuprofile');
    await writeFile(file, JSON.stringify(PROFILE));
    const text = [];
    assert.equal(main([file, '--top', '2'], (chunk) => text.push(chunk)), 0);
    assert.match(text.join(''), /^sampled 100 ms in 6 samples: busy 85 ms \(85 %\), idle 15 ms/u);
    assert.match(text.join(''), /70 ms {2}82\.4 % {2}encode {2}src\/transport\/message-router-delivery-encoding\.js:12/u);
    assert.equal(text.join(''), formatCpuProfileSummary(summarizeCpuProfile(PROFILE, {top: 2})));
    const json = [];
    assert.equal(main(['--json', file], (chunk) => json.push(chunk)), 0);
    assert.equal(JSON.parse(json.join('')).busyMs, 85);
    assert.equal(main(['--top', '3']), 2);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
