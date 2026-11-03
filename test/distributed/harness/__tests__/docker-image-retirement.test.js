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

// One image handle of the double: inspect answers what the daemon holds now,
// or the planted read error; remove deletes it, or refuses as planted.
function imageHandle(state, ref) {
  const {options, images, tags, calls, removed} = state;
  return {
    inspect: async () => {
      const built = arrayIncludes(calls, 'build');
      if (!built && ref === TAG && options.preBuildInspectError) {
        throw options.preBuildInspectError;
      }
      if (built && ref === options.previous && options.previousInspectError) {
        throw options.previousInspectError;
      }
      const image = images.get(tags.get(ref) ?? ref);
      if (!image) throw Object.assign(new Error('no such image'), {statusCode: 404});
      return {...image,
        RepoTags: Array.isArray(image.RepoTags) ? [...image.RepoTags] : image.RepoTags};
    },
    remove: async (removeOptions) => {
      calls.push(['remove', ref, removeOptions ?? null]);
      if (options.removeError) {
        throw Object.assign(new Error(options.removeError),
          {statusCode: options.removeStatus ?? 409});
      }
      removed.push(ref);
      images.delete(ref);
    },
  };
}

// Building moves the tag to the built image and leaves the old one with
// whatever other tags it had, reported untagged as planted.
function moveTag(state) {
  const {options, images, tags} = state;
  const old = tags.get(TAG);
  if (old && old !== options.built) {
    const image = images.get(old);
    image.RepoTags = arrayFilter(image.RepoTags, (name) => name !== TAG);
    if (image.RepoTags.length === 0) image.RepoTags = options.untaggedAs;
  }
  images.set(options.built, {Id: options.built, RepoTags: [TAG]});
  tags.set(TAG, options.built);
}

const DAEMON_DEFAULTS = Object.freeze({previous: OLD, previousTags: [], containers: [],
  removeError: null, removeStatus: null, built: NEW, extra: {}, untaggedAs: [DANGLING],
  preBuildInspectError: null, previousInspectError: null, listError: null});

// The daemon's images by id, the tag map, and the containers.
function daemon(overrides = {}) {
  const options = {...DAEMON_DEFAULTS, ...overrides};
  const state = {options, images: new Map(), tags: new Map(), calls: [], removed: []};
  if (options.previous) {
    state.images.set(options.previous,
      {Id: options.previous, RepoTags: [TAG, ...options.previousTags]});
    state.tags.set(TAG, options.previous);
  }
  for (const [id, image] of Object.entries(options.extra)) state.images.set(id, image);
  const docker = {
    buildImage: async () => {
      state.calls.push('build');
      moveTag(state);
      return {};
    },
    getImage: (ref) => imageHandle(state, ref),
    listContainers: async (listOptions) => {
      state.calls.push(['listContainers', listOptions ?? null]);
      if (options.listError) throw options.listError;
      return options.containers;
    },
    pruneImages: async () => {
      throw new Error('a blanket prune is never the harness\'s to run');
    },
  };
  return {docker, removed: state.removed, calls: state.calls};
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

const SERVER_ERROR = Object.assign(new Error('(HTTP code 500) server error'), {statusCode: 500});
const REFUSED = Object.assign(new Error('connect ECONNREFUSED /var/run/docker.sock'),
  {code: 'ECONNREFUSED'});

test('a pre-build read that fails is unverified, never a fresh host', async (t) => {
  for (const error of [SERVER_ERROR, REFUSED]) {
    const fake = daemon({preBuildInspectError: error});
    const {retire} = await build(t, fake);
    assert.deepEqual(fake.removed, []);
    assert.deepEqual([retire[0].stage, retire[0].previousId, retire[0].unreadable],
      ['recorded', null, error.message], 'the recorded event names the failed read');
    assert.equal(retire.at(-1).stage, 'kept-unverified');
    assert.equal(retire.at(-1).detail, error.message);
  }
  const fresh = daemon({previous: null});
  const {retire} = await build(t, fresh);
  assert.deepEqual([retire[0].unreadable, retire.at(-1).stage], [null, 'none'],
    'a 404 is a fresh host');
});

test('a post-build read that fails keeps the image unverified', async (t) => {
  for (const options of [{previousInspectError: SERVER_ERROR}, {listError: REFUSED}]) {
    const fake = daemon(options);
    const {retire} = await build(t, fake);
    assert.deepEqual(fake.removed, []);
    assert.equal(retire.at(-1).stage, 'kept-unverified');
    assert.match(retire.at(-1).detail, /server error|ECONNREFUSED/u);
  }
});

test('a container matching the previous image by ImageID or by Image alone keeps it',
  async (t) => {
    for (const container of [{Id: 'c1', Image: 'distributed-db:test', ImageID: OLD},
      {Id: 'c2', Image: OLD, ImageID: 'sha256:other'}]) {
      const fake = daemon({containers: [container]});
      const {retire} = await build(t, fake);
      assert.deepEqual(fake.removed, []);
      assert.equal(retire.at(-1).stage, 'kept-in-use');
      assert.equal(retire.at(-1).detail, container.Id);
    }
  });

test('stopped containers count: the listing asks for all of them', async (t) => {
  const fake = daemon();
  await build(t, fake);
  const listed = arrayFilter(fake.calls, (call) => call[0] === 'listContainers');
  assert.deepEqual(arrayMap(listed, (call) => call[1]), [{all: true}]);
});

test('an untagged image reported with null or empty RepoTags is removed', async (t) => {
  for (const untaggedAs of [null, []]) {
    const fake = daemon({untaggedAs});
    const {retire} = await build(t, fake);
    assert.deepEqual(fake.removed, [OLD]);
    assert.equal(retire.at(-1).stage, 'removed');
  }
});

test('a tag list or container listing that is not a list is unverified', async (t) => {
  const odd = daemon({untaggedAs: 'distributed-db:test'});
  const tagsAnswer = (await build(t, odd)).retire.at(-1);
  assert.deepEqual([tagsAnswer.stage, tagsAnswer.detail],
    ['kept-unverified', 'the previous image\'s tags are not a list']);
  assert.deepEqual(odd.removed, []);
  const fake = daemon();
  fake.docker.listContainers = async () => ({containers: []});
  const listAnswer = (await build(t, fake)).retire.at(-1);
  assert.deepEqual([listAnswer.stage, listAnswer.detail],
    ['kept-unverified', 'the container listing is not a list']);
  assert.deepEqual(fake.removed, []);
});

test('a previous image removed by someone else meanwhile is gone, not a failure',
  async (t) => {
    const fake = daemon({removeError: 'no such image', removeStatus: 404});
    const {retire} = await build(t, fake);
    assert.equal(retire.at(-1).stage, 'none');
    assert.match(retire.at(-1).detail, /already gone/u);
  });
