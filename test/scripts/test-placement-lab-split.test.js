// Lab placement of a hand `lab test` run: the machine taken from measured
// facts, and a split spread by capacity over the free lab hosts (split out of
// test-placement.test.js, which holds the placed runner's own witnesses).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  controllerHeadroom, formatLabDecision, formatLabSkipped, placeLabLanes, placementMachines,
  runLabTest,
} from '../../scripts/lab/probe.js';
import {CONTROLLER, LANE, fakeInventory, lab} from './test-placement-fixtures.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const LANE_PLAN = Object.freeze([
  {resourceClass: LANE.ORDINARY, files: ['o1', 'o2'], jobs: 4},
  {resourceClass: LANE.EXTERNAL, files: ['t1'], jobs: 1},
  {resourceClass: LANE.BOOTSTRAP, files: ['b1'], jobs: 2},
  {resourceClass: LANE.EXCLUSIVE, files: ['x1'], jobs: 1},
]);

test('a hand lab run takes its machine from measured facts, never a written host', () => {
  const {fleet, state} = fakeInventory();
  const machines = placementMachines(fleet, state);
  assert.deepEqual(machines.map((machine) => [machine.name, machine.cores, machine.memKiB]),
    [['alpha', 12, 16 * 1024 * 1024], ['beta', 8, 16 * 1024 * 1024]],
    'each machine carries its measured capacity');
  const controller = {name: '(controller)', controller: true, speed: 1, cores: 20,
    memKiB: 32 * 1024 * 1024};
  const names = (assignments) => assignments.map((one) =>
    [one.machine.name, one.lanes.map((lane) => lane.resourceClass)]);

  // One lane, nowhere named: the fastest ready machine, measured this run.
  assert.deepEqual(names(placeLabLanes([LANE_PLAN[3]], machines, {controller})),
    [['beta', [LANE.EXCLUSIVE]]]);
  assert.deepEqual(names(placeLabLanes(LANE_PLAN, machines, {on: 'alpha', controller})),
    [['alpha', LANE_PLAN.map((lane) => lane.resourceClass)]], '--on names the machine');
  assert.throws(() => placeLabLanes(LANE_PLAN, machines, {on: 'gamma', controller}),
    /gamma is not a ready lab machine/u);
  assert.throws(() => placeLabLanes(LANE_PLAN, [], {controller}), /no lab machine is ready/u);

  // The decision is printed with the capacities it was made from.
  assert.deepEqual(formatLabDecision(placeLabLanes(LANE_PLAN, machines, {on: 'beta',
    controller})), ['lab test: beta: ordinary, external-toolchain, bootstrap, exclusive ' +
    '(5 files) cores=8 mem=16.0GiB speed x0.75']);
});

// The fleet observed on 2026-10-04 when a split put 353 of 367 changed files
// on a controller at 82-89C: four ready, free lab hosts measured slower per
// thread than the controller (fleet's "speed xN" is a slowdown factor).
const OBSERVED_LABS = Object.freeze([
  lab('tv-dator', 1.40, {cores: 12}), lab('lenovo-laptop', 2.2, {cores: 8}),
  lab('adam-laptop', 1.96, {cores: 8}), lab('adams-gamla', 2.05, {cores: 4}),
]);
const OBSERVED_CONTROLLER = Object.freeze({...CONTROLLER, cores: 20});
const CHANGED_367 = Object.freeze([
  {resourceClass: LANE.ORDINARY, count: 330, jobs: 4},
  {resourceClass: LANE.EXTERNAL, count: 8, jobs: 1},
  {resourceClass: LANE.BOOTSTRAP, count: 15, jobs: 2},
  {resourceClass: LANE.EXCLUSIVE, count: 14, jobs: 1},
].map(({resourceClass, count, jobs}) => ({resourceClass, jobs,
  files: Array.from({length: count}, (_, index) => `test/${resourceClass}-${index}.test.js`)})));
const CHANGED_COSTS = Object.freeze(CHANGED_367.flatMap((lane) => lane.files.map((file) =>
  ({file, ms: 20 * SECOND, jobs: lane.jobs, lane: lane.resourceClass}))));
const HOT = Object.freeze({fit: false, reason: 'thermally held: CPU package 86C >= 75C'});

function shareOf(assignments, name) {
  return assignments.filter((one) => one.machine.name === name)
    .reduce((sum, one) => sum + one.lanes.reduce((count, lane) => count + lane.files.length, 0), 0);
}

test('a split spreads a changed set over the free lab hosts by capacity, never a hot controller',
  () => {
    const split = (options) => placeLabLanes(CHANGED_367, OBSERVED_LABS,
      {split: true, controller: OBSERVED_CONTROLLER, costs: CHANGED_COSTS, ...options});
    const hot = split({controllerHeadroom: HOT});
    assert.equal(shareOf(hot, '(controller)'), 0, 'a thermally held controller takes nothing');
    const shares = OBSERVED_LABS.map((machine) => shareOf(hot, machine.name));
    assert.equal(shares.reduce((sum, count) => sum + count, 0), 367, 'every file placed once');
    // Capacity: the lane's workers it runs (cores less one) over its speed.
    assert.ok(shares[0] > shares[2] && shares[2] > shares[1] && shares[1] > shares[3],
      `tv-dator > adam-laptop > lenovo-laptop > adams-gamla by capacity: ${shares}`);
    const finishes = hot.map((one) => one.loadMs);
    assert.ok(Math.max(...finishes) < 1.2 * Math.min(...finishes),
      `in proportion to capacity: every host finishes together (${finishes})`);
    // A controller with headroom is one more machine, never the default.
    const fit = split({});
    assert.ok(shareOf(fit, '(controller)') > 0, 'a cool controller takes a share');
    assert.ok(shareOf(fit, '(controller)') < 367 / 2, 'and the majority goes to the lab');
    // Only what no lab host fits stays on a held controller.
    const long = [...CHANGED_COSTS.slice(1), {...CHANGED_COSTS[0], ms: 4 * MINUTE}];
    const tooLong = split({controllerHeadroom: HOT, costs: long});
    assert.deepEqual(tooLong.filter((one) => one.machine.controller)
      .flatMap((one) => one.lanes.flatMap((lane) => lane.files)), [CHANGED_COSTS[0].file]);
  });

test('the controller has headroom only under the thermal and load owners\' thresholds', () => {
  const ok = () => ({outcome: 'headroom-ok', reading: {reason: 'under the hold thresholds'}});
  assert.deepEqual(controllerHeadroom({thermal: ok, load: 4, cores: 20}),
    {fit: true, reason: null});
  assert.deepEqual(controllerHeadroom({thermal: ok, load: 18, cores: 20}),
    {fit: false, reason: 'loaded: one-minute load 18.0 >= 15.0 (20 cores)'});
  assert.deepEqual(controllerHeadroom({thermal: () => ({outcome: 'headroom-exhausted',
    reading: {reason: 'CPU package 86C >= 75C'}}), load: 1, cores: 20}),
  {fit: false, reason: 'thermally held: CPU package 86C >= 75C'});
  // The real thermal owner, read once: a hold is not waited out here.
  const started = Date.now();
  const real = controllerHeadroom({load: 0, cores: 20});
  assert.ok(Date.now() - started < 10 * SECOND, 'one reading, no wait');
  assert.equal(typeof real.fit, 'boolean');
});

test('concurrent splits spread over the lab rather than all choosing one host', () => {
  const split = (machines, held = []) => placeLabLanes(CHANGED_367, machines, {split: true,
    held, controller: OBSERVED_CONTROLLER, costs: CHANGED_COSTS, controllerHeadroom: HOT});
  const hosts = (assignments) => assignments.map((one) => one.machine.name).sort();
  // Three agents splitting from the same fleet reading each use every host.
  const together = [split(OBSERVED_LABS), split(OBSERVED_LABS), split(OBSERVED_LABS)];
  for (const assignments of together) {
    assert.ok(hosts(assignments).length >= 3, `not one host: ${hosts(assignments)}`);
  }
  // A later split reads the first one's holds: it takes the free hosts, and
  // a held host only for what no free host takes.
  const later = split(OBSERVED_LABS.slice(2), OBSERVED_LABS.slice(0, 2));
  assert.deepEqual(hosts(later), ['adam-laptop', 'adams-gamla']);
  // With every host held and the controller hot, the shares queue on the
  // held hosts' locks (the convention's bounded wait), not on the controller.
  const full = split([], OBSERVED_LABS);
  assert.equal(shareOf(full, '(controller)'), 0);
  assert.ok(hosts(full).length >= 3, `spread over the held hosts: ${hosts(full)}`);
});

test('a split says why it left each machine out', () => {
  const ready = {ready: true, missing: [], gaps: []};
  const busyLock = {state: 'busy', holder: {agent: 'claude:other', project: 'lagrange',
    purpose: 'test:ordinary', startedAt: '2026-10-04T17:52:07Z', expectedMinutes: 38}};
  const fleet = [
    {name: '(controller)', controller: true, capability: {}, readiness: ready},
    {name: 'tv-dator', capability: {}, readiness: ready},
    {name: 'main-linux', sameMachineAs: '(controller)', capability: {}, readiness: ready},
    {name: 'lenovo-laptop', capability: {machineLock: busyLock}, readiness: ready},
    {name: 'carinas-windows', capability: {},
      readiness: {ready: false, missing: ['no-repository'], gaps: []}},
    {name: 'adams-gamla', capability: {}, readiness: ready},
  ];
  const assignments = [{machine: {name: 'tv-dator'}, lanes: []}];
  assert.deepEqual(formatLabSkipped(fleet, assignments, HOT), [
    'lab test: skipped (controller): thermally held: CPU package 86C >= 75C',
    'lab test: skipped main-linux: same machine as (controller)',
    'lab test: skipped lenovo-laptop: busy: held by claude:other (lagrange, test:ordinary) ' +
      'since 2026-10-04T17:52:07Z, expected 38 min',
    'lab test: skipped carinas-windows: not ready: no-repository',
    'lab test: skipped adams-gamla: not needed (its share would not outlast its setup, ' +
      'or nothing fits it)',
  ]);
});

test('a split prints its plan and every skipped machine before any share starts', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-test-plan-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const {fleet} = fakeInventory();
  const events = [];
  const machines = OBSERVED_LABS.map((machine) => ({...machine, memKiB: 1024 * 1024}));
  await runLabTest({plan: CHANGED_367, costs: CHANGED_COSTS, split: true,
    commit: {sha: 'a'.repeat(40), gitRoot: root, release: () => {}}, root,
    write: (line) => events.push(line)}, {
    discover: async () => ({fleet, machines}),
    commitAt: () => 'a'.repeat(40),
    controllerHeadroom: () => HOT,
    runRemote: (shard) => {
      events.push(`started ${shard.machine.name}`);
      return {done: Promise.resolve({status: 0, log: '', errors: ''})};
    },
  });
  const firstStart = events.findIndex((line) => line.startsWith('started '));
  const plan = events.slice(0, firstStart);
  assert.equal(plan.filter((line) => /^lab test: [^ ]+: .*\(\d+ files\).* ~[\d.]+ min$/u
    .test(line)).length, 4, `one line per host with its share and estimate: ${plan.join('\n')}`);
  assert.ok(plan.includes('lab test: skipped (controller): thermally held: CPU package 86C >= 75C'),
    plan.join('\n'));
  assert.ok(plan.includes('lab test: skipped gamma: not ready: no-repository'), plan.join('\n'));
});
