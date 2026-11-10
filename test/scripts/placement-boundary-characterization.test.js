import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import * as placement from '../../scripts/lab/probe.js';
import * as packaging from '../../scripts/release-npm-package.js';
import {capturePlacementScripts} from './placement-shell-characterization-fixture.js';

const FIXTURE = new URL('../fixtures/placement-characterization/', import.meta.url);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MINUTE = 60000;

test('placement and packaging retain the complete frozen public export surfaces', () => {
  const census = JSON.parse(fs.readFileSync(new URL('public-exports.json', FIXTURE), 'utf8'));
  assert.deepEqual(Object.keys(placement).sort(), census.exports['scripts/lab/probe.js']);
  assert.deepEqual(Object.keys(packaging).sort(), census.exports['scripts/release-npm-package.js']);
});

test('the public placement path assembles byte-identical frozen shell scripts', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval',
    `process.stdout.write(JSON.stringify(await (${capturePlacementScripts.toString()})()));`],
  {cwd: ROOT, encoding: 'utf8', timeout: 15000});
  assert.equal(child.status, 0, child.stderr);
  const scripts = JSON.parse(child.stdout);
  assert.deepEqual(scripts.wrappers,
    JSON.parse(fs.readFileSync(new URL('wrappers.json', FIXTURE), 'utf8')));
  for (const name of ['default', 'artifacts']) {
    assert.equal(scripts[name], fs.readFileSync(new URL(`${name}.sh`, FIXTURE), 'utf8'), name);
  }
});

test('non-split placement preserves machine and lane identity under equal-speed ties', () => {
  const first = {name: 'first', speed: 1};
  const second = {name: 'second', speed: 1};
  const plan = [{resourceClass: 'ordinary', jobs: 1, files: ['test/a.test.js']}];
  const machines = [first, second];
  const assigned = placement.placeLabLanes(plan, machines);
  assert.deepEqual(assigned, [{machine: first, lanes: plan}]);
  assert.equal(assigned[0].machine, first);
  assert.equal(assigned[0].lanes, plan);
  assert.deepEqual(machines, [first, second]);
});

test('equal-cost file allocation preserves deterministic order and original machine objects', () => {
  const first = {name: 'first', speed: 1};
  const second = {name: 'second', speed: 1};
  const costs = ['b', 'a', 'c'].map((file) => ({file, ms: MINUTE, jobs: 1}));
  const assigned = placement.placeTestFiles(costs, [first, second], {setupMs: 0});
  assert.deepEqual(assigned, [
    {machine: first, files: ['a', 'c'], loadMs: 2 * MINUTE},
    {machine: second, files: ['b'], loadMs: MINUTE},
  ]);
  assert.equal(assigned[0].machine, first);
  assert.equal(assigned[1].machine, second);
  assert.deepEqual(costs.map(({file}) => file), ['b', 'a', 'c']);
});

test('split dispatch accepts held-only capacity before the empty-free-machine refusal', () => {
  const plan = [{resourceClass: 'ordinary', jobs: 1, files: ['test/a.test.js']}];
  const held = [{name: 'held-one', speed: 1, waitMs: 0},
    {name: 'held-two', speed: 1, waitMs: 0}];
  const controller = {name: 'controller', controller: true, speed: 1};
  const costs = [{file: 'test/a.test.js', ms: 2 * MINUTE, jobs: 1}];
  const options = {held, controller, costs};
  const split = placement.planLabSplit(plan, [], options);
  const assignments = [{machine: {name: 'held-one', speed: 1, waitMs: 0},
    loadMs: 150000, lanes: plan}];
  assert.deepEqual(split, {assignments, controller: {reserve: true,
    reason: 'reserve - 0 free lab hosts, 2 held lab hosts, queued on their locks ' +
      '(longest expected wait ~0.0 min)'}});
  assert.deepEqual(placement.placeLabLanes(plan, [], {...options, split: true}), assignments);
  assert.notEqual(split.assignments[0].machine, held[0], 'queued hosts are copied');
});
