/**
 * A grant that nothing requires proves nothing. This reads the release
 * workflow itself and checks that every step performing an outward action
 * requires its grant on the same path, ahead of the command that acts.
 *
 * It is deliberately a reading of the YAML: that is where these actions live,
 * and a scenario that exercised the grant machinery alone could pass while the
 * workflow pushed an image without asking anything.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import {ACTION} from '../../scripts/action-authority.js';

const WORKFLOW = '.github/workflows/release.yml';
const REQUIRE = 'action-grant.js require';
const ISSUE = 'action-grant.js issue';
// The outward commands this workflow runs, and the action each one is.
const OUTWARD = Object.freeze([
  ['docker push', ACTION.PUBLISH_CONTAINER_IMAGE],
  ['gh release create', ACTION.CREATE_PUBLIC_RELEASE],
]);

function workflow() {
  return fs.readFileSync(WORKFLOW, 'utf8');
}

test('every outward workflow step requires its grant before it acts', () => {
  const text = workflow();
  for (const [command, action] of OUTWARD) {
    const acts = text.indexOf(command);
    assert.notEqual(acts, -1, `${command} is no longer in the workflow`);
    const requires = text.indexOf(`${REQUIRE} \\\n            --action ${action}`);
    assert.notEqual(requires, -1,
      `${command} runs without requiring a grant for ${action}`);
    assert.ok(requires < acts,
      `${action} is required after ${command} has already acted`);
  }
});

test('the workflow issues a grant for every action it requires', () => {
  // A required grant nobody issues would stop the release rather than gate it;
  // an issued grant nobody requires would gate nothing.
  const text = workflow();
  for (const [, action] of OUTWARD) {
    assert.ok(text.includes(`${ISSUE} \\\n            --action ${action}`),
      `nothing issues a grant for ${action}`);
  }
});

test('the workflow authorizes from the tag, not from what it built', () => {
  // The subject is the tag a maintainer pushed. Deriving it from an artifact
  // the job produced would be the executor authorizing itself.
  const text = workflow();
  const issues = [...text.matchAll(/action-grant\.js issue[\s\S]{0,160}?--subject "([^"]+)"/gu)];
  assert.equal(issues.length, OUTWARD.length);
  for (const issue of issues) {
    assert.equal(issue[1], '$GITHUB_REF_NAME',
      'a grant was issued for something other than the pushed tag');
  }
});
