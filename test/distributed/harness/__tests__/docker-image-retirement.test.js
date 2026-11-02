/**
 * The harness image build retires the build its tag replaced
 * (harness-image-build-leftovers). Every lab scenario and cone run rebuilds
 * distributed-db:test on each docker host; the previous build stayed behind
 * untagged (86 of them, ~787 MB virtual each, filled adam-laptop's root
 * partition). After a successful build the provider removes the image the
 * tag pointed at before, only when it is now untagged and no container uses
 * it, and records the previous id and the outcome as typed operation events.
 * A docker double: no live docker.
 */
import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {DockerProvider} from '../docker-provider.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFind = Function.call.bind(Array.prototype.find);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayIncludes = Function.call.bind(Array.prototype.includes);

const TAG = 'distributed-db:test';
const OLD = 'sha256:' + 'a'.repeat(64);
const NEW = 'sha256:' + 'b'.repeat(64);
const PINNED = 'sha256:' + 'c'.repeat(64);
const DANGLING = '<none>:<none>';

function context(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-retirement-'));
  t.teardown(() => rmSync(dir, {force: true, recursive: true}));
  writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:22-slim\nCOPY src/ ./src/\n');
  return dir;
}

// The daemon's images by id, the tag map, and the containers; building moves
// the tag to NEW and leaves the old image with whatever other tags it had.
function daemon({previous = OLD, previousTags = [], containers = [], removeError = null,
  built = NEW, extra = {}} = {}) {
  const images = new Map();
  const tags = new Map();
  if (previous) {
    images.set(previous, {Id: previous, RepoTags: [TAG, ...previousTags]});
    tags.set(TAG, previous);
  }
  for (const [id, image] of Object.entries(extra)) images.set(id, image);
  const removed = [];
  const calls = [];
  const resolve = (ref) => images.get(tags.get(ref) ?? ref) ?? null;
  const docker = {
    buildImage: async () => {
      calls.push('build');
      const old = tags.get(TAG);
      if (old && old !== built) {
        const image = images.get(old);
        image.RepoTags = arrayFilter(image.RepoTags, (name) => name !== TAG);
        if (image.RepoTags.length === 0) image.RepoTags = [DANGLING];
      }
      images.set(built, {Id: built, RepoTags: [TAG]});
      tags.set(TAG, built);
      return {};
    },
    getImage: (ref) => ({
      inspect: async () => {
        const image = resolve(ref);
        if (!image) throw Object.assign(new Error('no such image'), {statusCode: 404});
        return {...image, RepoTags: [...image.RepoTags]};
      },
      remove: async (options) => {
        calls.push(['remove', ref, options ?? null]);
        if (removeError) throw new Error(removeError);
        removed.push(ref);
        images.delete(ref);
      },
    }),
    listContainers: async (options) => {
      calls.push(['listContainers', options ?? null]);
      return containers;
    },
    pruneImages: async () => {
      throw new Error('a blanket prune is never the harness\'s to run');
    },
  };
  return {docker, removed, calls};
}

async function build(t, fake) {
  const events = [];
  const provider = new DockerProvider({socketPath: '/var/run/docker.sock',
    operationSink: (event) => events.push(event)});
  provider._docker = fake.docker;
  provider._collectBuildOutput = async () => [{stream: 'Successfully built\n'}];
  await provider.buildImage(context(t), TAG);
  const retire = arrayFilter(events, (event) => event.operation === 'image.retire-previous');
  return {events, retire};
}

test('the build its tag replaced is removed when untagged and unused', async (t) => {
  const fake = daemon();
  const {retire} = await build(t, fake);
  assert.deepEqual(fake.removed, [OLD]);
  assert.deepEqual(arrayMap(retire, (event) => [event.stage, event.previousId]),
    [['recorded', OLD], ['removed', OLD]]);
  assert.equal(retire[1].currentId, NEW);
  const removal = arrayFind(fake.calls, (call) => call[0] === 'remove');
  assert.ok(!removal[2]?.force, 'never forced');
});

test('a previous image another tag still names is kept', async (t) => {
  const fake = daemon({previousTags: ['lagrange-product:0.4.0']});
  const {retire} = await build(t, fake);
  assert.deepEqual(fake.removed, []);
  assert.equal(retire.at(-1).stage, 'kept-tagged');
});

test('a previous image a container uses is kept', async (t) => {
  const fake = daemon({containers: [{Id: 'c1', Image: OLD, ImageID: OLD}]});
  const {retire} = await build(t, fake);
  assert.deepEqual(fake.removed, []);
  assert.equal(retire.at(-1).stage, 'kept-in-use');
});

test('no previous image, or a build that reused it, removes nothing', async (t) => {
  const fresh = daemon({previous: null});
  assert.equal((await build(t, fresh)).retire.at(-1).stage, 'none');
  assert.deepEqual(fresh.removed, []);
  const same = daemon({built: OLD});
  assert.equal((await build(t, same)).retire.at(-1).stage, 'none');
  assert.deepEqual(same.removed, []);
});

test('a removal the daemon refuses is recorded and never fails the build', async (t) => {
  const fake = daemon({removeError: 'conflict: image has dependent child images'});
  const {retire, events} = await build(t, fake);
  assert.equal(retire.at(-1).stage, 'kept-remove-failed');
  assert.match(retire.at(-1).detail, /dependent child images/u);
  assert.ok(arraySome(events, (event) => event.operation === 'image.build' &&
    event.stage === 'completed'));
});

test('nothing but the replaced build is ever touched', async (t) => {
  const fake = daemon({extra: {
    [PINNED]: {Id: PINNED, RepoTags: [DANGLING]},
  }});
  await build(t, fake);
  assert.deepEqual(fake.removed, [OLD], 'another dangling image is not the harness\'s');
  assert.ok(!arrayIncludes(fake.calls, 'prune'));
});

test('a failed build retires nothing', async (t) => {
  const fake = daemon();
  const events = [];
  const provider = new DockerProvider({socketPath: '/var/run/docker.sock',
    operationSink: (event) => events.push(event)});
  provider._docker = fake.docker;
  provider._collectBuildOutput = async () => [{error: 'COPY failed'}];
  await assert.rejects(() => provider.buildImage(context(t), TAG));
  assert.deepEqual(fake.removed, []);
  assert.ok(!arraySome(events, (event) => event.operation === 'image.retire-previous' &&
    event.stage !== 'recorded'));
});
