/**
 * R26 has to hold where this repository's most consequential outward actions
 * live, and two of them live in workflow YAML that cannot import a decision.
 * These scenarios pin the shape that closes that: the authority decides before
 * the noninteractive executor runs, and the executor cannot proceed without the
 * decision it names.
 *
 * What they most need to catch is a grant becoming a substitute for a decision.
 * A file on disk is evidence that an authorization happened; it is not an
 * authorization, and none of these scenarios lets it become one.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';

import {
  ACTION, GRANT_DIRECTORY, MESSAGE, grantShortfall, issueGrant,
} from '../../scripts/checks/action-grant.js';

const TAG = 'v9.9.9';
const OTHER_TAG = 'v9.9.10';

// A repository the grant machinery can be exercised in, with a head of its own
// so head binding is a real property rather than an inherited one.
function scratchRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'action-grant-'));
  const run = (args) => execFileSync('git', args, {cwd: root, stdio: 'ignore'});
  run(['init', '--quiet']);
  run(['config', 'user.email', 'grant@example.test']);
  run(['config', 'user.name', 'Grant Fixture']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'one');
  run(['add', '-A']);
  run(['commit', '--quiet', '-m', 'one']);
  return root;
}

function advanceHead(root) {
  fs.writeFileSync(path.join(root, 'a.txt'), 'two');
  execFileSync('git', ['add', '-A'], {cwd: root, stdio: 'ignore'});
  execFileSync('git', ['commit', '--quiet', '-m', 'two'], {cwd: root, stdio: 'ignore'});
}

test('an executor cannot proceed without a grant', () => {
  const root = scratchRepo();
  assert.equal(
    grantShortfall({root, action: ACTION.PUBLISH_CONTAINER_IMAGE, subject: TAG}),
    MESSAGE.NO_GRANT);
});

test('the authority decides, and a grant records that it did', () => {
  const root = scratchRepo();
  const issued = issueGrant({root, action: ACTION.PUBLISH_CONTAINER_IMAGE, subject: TAG});
  assert.equal(issued.outcome, 'authorized');
  assert.equal(issued.grant.subject, TAG);
  assert.equal(grantShortfall({root, action: ACTION.PUBLISH_CONTAINER_IMAGE,
    subject: TAG}), null);
});

test('a grant for one subject authorizes no other', () => {
  const root = scratchRepo();
  issueGrant({root, action: ACTION.PUBLISH_CONTAINER_IMAGE, subject: TAG});
  assert.equal(
    grantShortfall({root, action: ACTION.PUBLISH_CONTAINER_IMAGE, subject: OTHER_TAG}),
    MESSAGE.WRONG_SUBJECT);
});

test('a grant for one action authorizes no other', () => {
  const root = scratchRepo();
  issueGrant({root, action: ACTION.PUBLISH_CONTAINER_IMAGE, subject: TAG});
  assert.equal(
    grantShortfall({root, action: ACTION.CREATE_PUBLIC_RELEASE, subject: TAG}),
    MESSAGE.NO_GRANT);
});

test('a grant does not survive the head it was issued for', () => {
  // The decision was about a tree. Moving the tree invalidates it rather than
  // carrying it forward silently.
  const root = scratchRepo();
  issueGrant({root, action: ACTION.PUBLISH_CONTAINER_IMAGE, subject: TAG});
  advanceHead(root);
  assert.equal(
    grantShortfall({root, action: ACTION.PUBLISH_CONTAINER_IMAGE, subject: TAG}),
    MESSAGE.WRONG_HEAD);
});

test('a forged grant is not an authorization', () => {
  // The most important property: requiring a grant re-asks the authority. A
  // file naming an unregistered action, or claiming a subject it does not
  // carry, buys nothing.
  const root = scratchRepo();
  const forged = path.join(root, GRANT_DIRECTORY, 'force-push-main.json');
  fs.mkdirSync(path.dirname(forged), {recursive: true});
  fs.writeFileSync(forged, JSON.stringify({
    schema: 'action-grant/1', action: 'force-push-main', subject: TAG,
    head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
  }));
  assert.notEqual(
    grantShortfall({root, action: 'force-push-main', subject: TAG}), null,
    'a grant for an unregistered action authorized it');
});

test('an unreadable grant is a refusal, not an absence of one', () => {
  const root = scratchRepo();
  const file = path.join(root, GRANT_DIRECTORY,
    `${ACTION.CREATE_PUBLIC_RELEASE}.json`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, 'not json');
  assert.equal(
    grantShortfall({root, action: ACTION.CREATE_PUBLIC_RELEASE, subject: TAG}),
    MESSAGE.UNREADABLE);
});

test('the authority refuses to issue what it would not permit', () => {
  const root = scratchRepo();
  const issued = issueGrant({root, action: 'force-push-main', subject: TAG});
  assert.equal(issued.outcome, 'refused');
  assert.equal(issued.grant, undefined, 'a refusal still wrote a grant');
  assert.equal(fs.existsSync(path.join(root, GRANT_DIRECTORY, 'force-push-main.json')),
    false);
});
