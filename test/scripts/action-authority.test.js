/**
 * R26 says an outward or irreversible action is performed only where the
 * operator's authority for it already exists. These scenarios are the
 * acceptance tests for the owner of that decision.
 *
 * The shape they enforce is one path - request, decision, execution - and a
 * closed door by default. Before this owner existed, the publisher interpreted
 * some signals itself, the record store was consulted directly, several
 * outward actions were behind no signal at all, and absence of a signal meant
 * proceed. Each of those is a scenario here.
 */

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {test} from 'node:test';

import {
  ACTION, OUTCOME, authorizeAction, isAuthorized, registeredActions,
} from '../../scripts/action-authority.js';
import {publishNpmPackage} from '../../scripts/release-npm-package.js';
import {uploadAndVerify} from '../../scripts/solve/evidence-store.js';
import {validatePublishRequest} from '../../scripts/publish-head.js';
import {buildHarnessImage} from '../../scripts/build-gcp-harness-image.js';
import {
  provisionGcpDockerHosts,
} from '../../test/distributed/gcp-run-orchestration.js';

const PUBLISH_HEAD_JS = 'scripts/publish-head.js';
const AUTHORITY_JS = 'scripts/action-authority.js';
const RECORD_STORE_JS = 'scripts/solve/red-main-exemption.js';
const CLOUD_ENV = 'LAGRANGE_AUTHORIZE_CLOUD_PROJECT';
const EXISTING_FILE = 'package.json';
const CLOBBER_FLAG = '--clobber';
const MISSING_TARBALL = 'test-output/no-such-tarball.tgz';
const PACKAGED_VERSION = '0.0.0-authority-fixture';
const OTHER_VERSION = '9.9.9';
const PACKAGE_NAME = 'lagrange-server';
const FIXTURE_HEAD = 'b8ee3a0556e81b5917c72a2dbea3441fef3b8cc0';

// A real candidate the release path can actually inspect, so the scenario
// exercises the comparison rather than the packing step.
function candidateTarball(version) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'authority-candidate-'));
  const packageDir = path.join(scratch, 'package');
  fs.mkdirSync(packageDir);
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
    name: PACKAGE_NAME, version, gitHead: FIXTURE_HEAD,
  }));
  const tarball = path.join(scratch, 'candidate.tgz');
  execFileSync('tar', ['-czf', tarball, '-C', scratch, 'package']);
  return tarball;
}
// Exactly the actions that may carry a standing authority, named here so
// adding one to the registry cannot also widen this expectation.
const STANDING_ACTIONS = Object.freeze(['publish-head']);
const HEAD_SHA = 'b8ee3a0556e81b5917c72a2dbea3441fef3b8cc0';
const OTHER_SHA = 'c0670a2af496aa246a8c5ccd2d23efbe9e54fb52';
// Ways a module could perform an outward action itself.
const EXECUTION =
  /spawnSync|execFileSync|execSync|spawn\(|exec\(|fetch\(|request\(/u;
// Ways a module could write a record.
const PERSISTENCE =
  /writeFile|mkdir|rmSync|unlink|appendFile|copyFile|rename|createWriteStream/u;
const TAG_PUSH = /push[^\n]*(?:refs\/tags|--tags|\$\{?tag)/u;

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('absent authorization refuses rather than failing open', () => {
  // The failure this owner exists to remove: an action proceeding because
  // nothing said no.
  for (const action of registeredActions()) {
    const decision = authorizeAction({action, signal: null});
    if (decision.outcome === OUTCOME.AUTHORIZED) {
      assert.equal(decision.standing, true,
        `${action} authorized itself with no signal and no standing authority`);
      assert.ok(STANDING_ACTIONS.includes(action),
        `${action} carries a standing authority nobody agreed to`);
      continue;
    }
    assert.equal(decision.outcome, OUTCOME.REFUSED,
      `${action} did not refuse an absent authorization`);
    assert.equal(isAuthorized(decision), false);
  }
});

test('an authorization for one action does not authorize another', () => {
  const signal = {action: ACTION.PUBLISH_HEAD_ON_RED, head: HEAD_SHA,
    reason: 'the head this repairs'};
  assert.equal(
    isAuthorized(authorizeAction({action: ACTION.PUBLISH_HEAD_ON_RED, signal,
      context: {redHead: HEAD_SHA}})),
    true, 'the signal authorizes the action it names');
  for (const action of registeredActions()) {
    if (action === ACTION.PUBLISH_HEAD_ON_RED) continue;
    const decision = authorizeAction({action, signal});
    assert.equal(decision.outcome === OUTCOME.AUTHORIZED && !decision.standing,
      false, `a signal for one action authorized ${action}`);
  }
});

test('an unregistered outward action refuses by default', () => {
  // A newly introduced outward action has no authorization semantics yet, so
  // the door is shut until someone writes them.
  for (const unknown of ['force-push-main', 'rewrite-history', 'delete-remote-branch']) {
    const decision = authorizeAction({action: unknown,
      signal: {action: unknown, reason: 'because I said so'}});
    assert.equal(decision.outcome, OUTCOME.REFUSED,
      `${unknown} was not refused by default`);
    assert.equal(isAuthorized(decision), false);
  }
});

test('unavailable never permits an action', () => {
  const decision = authorizeAction({action: ACTION.PUBLISH_HEAD_ON_RED,
    signal: {action: ACTION.PUBLISH_HEAD_ON_RED, head: HEAD_SHA, reason: 'r'},
    context: {redHead: null}});
  assert.equal(decision.outcome, OUTCOME.UNAVAILABLE,
    'an undeterminable red head is unavailable, not authorized');
  assert.equal(isAuthorized(decision), false, 'unavailable is not permission');
  // And a signal naming a different head than the one actually red is refused.
  assert.equal(isAuthorized(authorizeAction({action: ACTION.PUBLISH_HEAD_ON_RED,
    signal: {action: ACTION.PUBLISH_HEAD_ON_RED, head: OTHER_SHA, reason: 'r'},
    context: {redHead: HEAD_SHA}})), false);
});

test('publication consumes the authority and interprets no signals', () => {
  // Behavioural, not textual: with a routing request the reviewed head does not
  // carry, the publisher must refuse rather than decide for itself.
  assert.throws(() => validatePublishRequest({
    headMessage: 'an ordinary reviewed commit', runner: 'self-hosted',
    fixesRed: null, reason: null, remoteSha: HEAD_SHA,
  }), /is refused/u, 'the publisher routed without the authority');
  assert.throws(() => validatePublishRequest({
    headMessage: 'an ordinary reviewed commit', runner: null,
    fixesRed: OTHER_SHA, reason: 'a reason', remoteSha: HEAD_SHA,
  }), /is refused/u, 'the publisher judged a red-branch signal itself');
  // And it no longer reads the record store behind the authority's back.
  const source = read(PUBLISH_HEAD_JS);
  assert.doesNotMatch(source, /red-main-exemption/u);
  assert.equal(source.includes(RECORD_STORE_JS), false);
});

test('evidence replacement consumes the authority', () => {
  // Something that merely looks like a request is not one, and the refusal
  // happens before the uploader is reached.
  const refusedRuns = [];
  assert.throws(() => uploadAndVerify({
    file: EXISTING_FILE, questId: 'a-quest', replace: 'yes',
    run: (args) => refusedRuns.push(args), root: process.cwd(),
  }), /refused/u, 'a replacement proceeded on a signal that was not a request');
  assert.deepEqual(refusedRuns, [], 'the uploader ran despite the refusal');
  // And with no request at all the upload does not clobber, so there is no
  // path here that silently overwrites what is already published.
  const uploads = [];
  try {
    uploadAndVerify({
      file: EXISTING_FILE, questId: 'a-quest',
      run: (args) => {
        uploads.push(args);
        throw new Error('stop after the upload');
      },
      root: process.cwd(),
    });
  } catch {
    // The stub ends the run once it has recorded the upload arguments.
  }
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].includes(CLOBBER_FLAG), false,
    'an unauthorized upload still clobbered');
});

test('package release consumes the authority', async () => {
  // Behavioural, against a real candidate: what the operator authorized is
  // compared with what is actually about to be published, and a mismatch
  // refuses before npm is reached. Naming nothing is a precondition, not an
  // authorization, and says so.
  await assert.rejects(
    () => publishNpmPackage(MISSING_TARBALL, null, undefined),
    /requires --authorize-version/u,
    'publishing proceeded with no authorized version');
  const tarball = candidateTarball(PACKAGED_VERSION);
  await assert.rejects(
    () => publishNpmPackage(tarball, null, OTHER_VERSION),
    /publishing this package is refused/u,
    'a version the operator did not authorize was published');
  // And the same call with the version actually packaged gets past the
  // authority and fails later, on the registry it cannot reach from here.
  await assert.rejects(
    () => publishNpmPackage(tarball, null, PACKAGED_VERSION),
    (error) => !/publishing this package is refused/u.test(error.message),
    'the authority refused the version it was given');
});

test('cloud provisioning consumes the authority', async () => {
  // A configuration key names the project; it does not authorize spending in
  // it. Without the operator's out-of-band authorization nothing is created.
  const before = process.env[CLOUD_ENV];
  delete process.env[CLOUD_ENV];
  await assert.rejects(
    () => provisionGcpDockerHosts({gcp: {project: 'a-project'}}, false),
    /refused/u, 'hosts were provisioned from a configuration key alone');
  // The image builder takes the same signal from the same place, and refuses
  // before it runs a single command.
  const ran = [];
  delete process.env[CLOUD_ENV];
  try {
    await assert.rejects(() => buildHarnessImage({
      project: 'a-project', zone: 'a-zone', builderName: 'a-builder',
      machineType: 'a-machine',
    }, {runCommand: (args) => {
      ran.push(args);
      throw new Error('resource was not found');
    }}), /refused/u, 'the image builder created hosts without authorization');
  } finally {
    if (before !== undefined) process.env[CLOUD_ENV] = before;
  }
  assert.equal(ran.filter((args) => args.includes('create')).length, 0,
    'a cloud host was created despite the refusal');
});

test('release tag publication is registered and performed nowhere', () => {
  // The action is registered so that code performing it must ask. No code is
  // written to perform it in order to test that: nothing here pushes a tag.
  assert.ok(registeredActions().includes(ACTION.PUBLISH_RELEASE_TAG));
  // And exactly the agreed actions carry a standing authority.
  const standing = registeredActions()
    .filter((action) => authorizeAction({action, signal: null}).standing === true);
  assert.deepEqual(standing, [...STANDING_ACTIONS]);
  assert.equal(isAuthorized(authorizeAction({action: ACTION.PUBLISH_RELEASE_TAG,
    signal: null})), false, 'a tag publication with no signal is not authorized');
  const performers = fs.readdirSync('scripts')
    .filter((name) => name.endsWith('.js'))
    .filter((name) => TAG_PUSH.test(read(`scripts/${name}`)));
  assert.deepEqual(performers, [],
    'something performs a tag push; it must ask the authority first');
});

test('the record store decides nothing', () => {
  // Persistence stays persistence. If the store started deciding there would
  // be two deciders again, which is the defect this owner removes.
  const source = read(RECORD_STORE_JS);
  assert.doesNotMatch(source, /action-authority/u,
    'the record store reaches into the authority');
  for (const outcome of Object.values(OUTCOME)) {
    assert.equal(source.includes(`'${outcome}'`), false,
      `the record store names the outcome ${outcome}, so it is deciding`);
  }
});

test('the authority performs no action', () => {
  // It decides and returns. It runs nothing, writes nothing, and cannot be the
  // place an outward action leaks out of.
  const source = read(AUTHORITY_JS);
  assert.doesNotMatch(source, EXECUTION, 'the authority executes something');
  assert.doesNotMatch(source, PERSISTENCE, 'the authority writes something');
  // It imports nothing, so it cannot reach anything that could act for it.
  assert.doesNotMatch(source, /^import /mu, 'the authority imports something');
});

test('every registered action declares its signal', () => {
  // An action in the registry with no stated requirement would be a door with
  // no lock, indistinguishable from the scattered enforcement this replaces.
  const actions = registeredActions();
  assert.ok(actions.length > 0);
  for (const action of actions) {
    const decision = authorizeAction({action, signal: null});
    assert.equal(typeof decision.requires, 'string',
      `${action} states no requirement`);
    assert.ok(decision.requires.length > 0);
  }
});
