// Red test 5, quest fresh-create-release-authority-from-committed-operation:
// the fresh CREATE release authority is a committed fact the answering leader
// reads, so no in-memory FRESH_CREATE token, pending-token map or up-front
// authorizeFreshCreate read remains (FRESH_SEED and OPERATOR carriers are out
// of scope and stay). Static: it reads the owner sources.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

const OWNER = new URL('../../src/node/participant-release-authorization-owner.js',
  import.meta.url);
const RECOVERY = new URL('../../src/node/replica-handler-release-recovery.js',
  import.meta.url);

test('5: no FRESH_CREATE token remains in the release authorization owner', () => {
  const owner = fs.readFileSync(OWNER, 'utf8');
  assert.doesNotMatch(owner, /PENDING_FRESH_CREATE/u,
    'the pending FRESH_CREATE token map is deleted');
  assert.doesNotMatch(owner, /\bauthorizeFreshCreate\b/u,
    'no up-front authorizeFreshCreate read mints a FRESH_CREATE token');
  assert.doesNotMatch(owner, /\bconfirmFreshCreate\b/u,
    'no node-local confirmation of a FRESH_CREATE token');
  assert.match(owner, /authorizeFreshSeed/u, 'FRESH_SEED authority is out of scope and stays');
  assert.match(owner, /authorizeOperator/u, 'OPERATOR authority is out of scope and stays');
});

test('5: releaseFreshCreate carries the create identity as data, never a token', () => {
  const recovery = fs.readFileSync(RECOVERY, 'utf8');
  assert.doesNotMatch(recovery, /\.authorizeFreshCreate\(/u,
    'releaseFreshCreate no longer reads an up-front authorization');
  assert.match(recovery, /createAdmissionIdentity/u,
    'the release request carries the create identity as a lookup key');
});
