import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  OWNER_DEBT_DEPENDENCY_POLICY_PATH,
  OWNER_DEBT_IMPORT_GRAPH_INPUT_AUTHORITIES,
  OWNER_DEBT_RESOLVER_STATE,
} from '../../scripts/global-owner-debt-inventory/constants.js';

const root = process.cwd();
const UTF8 = 'utf8';

test('the dependency policy is a declared import-graph authority', () => {
  // Being an authority is what binds the policy into the producer-input
  // identity. Classifying correctly at runtime while leaving the artifact
  // identity unbound would mean an edited policy produced an unchanged seal.
  assert.ok(
    OWNER_DEBT_IMPORT_GRAPH_INPUT_AUTHORITIES.includes(
      OWNER_DEBT_DEPENDENCY_POLICY_PATH),
    'dependency-policy.json must sit alongside package.json, ' +
    'package-lock.json and dependency-cruiser.config.cjs');
});

test('editing the policy changes the producer-input identity', async () => {
  const {javascriptSourceDigest, listImportGraphInputFiles} = await import(
    '../../scripts/global-owner-debt-inventory/helpers.js');
  const policyPath = path.join(root, OWNER_DEBT_DEPENDENCY_POLICY_PATH);
  const original = fs.readFileSync(policyPath, UTF8);
  const digestOf = () => javascriptSourceDigest(
    root, listImportGraphInputFiles(root));
  const before = digestOf();
  try {
    const mutated = JSON.parse(original);
    mutated.optionalExternals['@pulumi/gcp'].reason = 'mutated for this test';
    fs.writeFileSync(policyPath, `${JSON.stringify(mutated, null, 2)}\n`, UTF8);
    assert.notEqual(digestOf(), before,
      'a policy edit must move the producer-input digest, or an exemption ' +
      'could be added or removed without the seal noticing');
  } finally {
    fs.writeFileSync(policyPath, original, UTF8);
  }
  assert.equal(digestOf(), before, 'restoring the policy restores the digest');
});

test('optional-external is a distinct canonical resolver state', () => {
  assert.equal(OWNER_DEBT_RESOLVER_STATE.optionalExternal, 'optional-external');
  const states = new Set(Object.values(OWNER_DEBT_RESOLVER_STATE));
  assert.equal(states.size, 3,
    'resolved / unresolved / optional-external: an intentional absence must ' +
    'not be disguised as an ordinary failed resolution');
});

test('every optional-external entry names an owner and a reason', () => {
  const policy = JSON.parse(fs.readFileSync(
    path.join(root, OWNER_DEBT_DEPENDENCY_POLICY_PATH), UTF8));
  const entries = Object.entries(policy.optionalExternals || {});
  assert.ok(entries.length > 0);
  for (const [name, entry] of entries) {
    assert.ok(entry.owner, `${name} must name the file that imports it`);
    assert.ok(fs.existsSync(path.join(root, entry.owner)),
      `${name} names owner ${entry.owner}, which does not exist`);
    assert.ok(entry.reason, `${name} must record why it is not installed`);
    assert.ok(!name.includes('*'),
      `${name} must be an exact package name, never a pattern`);
  }
});
