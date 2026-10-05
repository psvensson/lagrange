// A complete verification record for a fixture quest, so any test that lands
// a production-surface change through `land` can approve it the way a real
// verifier must: templates written into the fixture tree, the reverted run's
// output recorded as an evidence finding, and a record naming the template,
// its red-on-revert and a census sample (docs/development/
// verification-templates/INDEX.md). Shared by test/solve/commands.test.js and
// any landing fixture that needs an approval to stand.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {ENTRY_TYPE, FINDING_KIND, VERDICT} from '../../scripts/solve/schema.js';
import {readLog} from '../../scripts/solve/store.js';
import {note} from '../../scripts/solve/commands.js';

const TEMPLATE_DIR = 'docs/development/verification-templates';
const FIXTURE_TEMPLATES = Object.freeze({
  'harness-fidelity': '---\ncategories: [harness-fidelity]\n---\n# H\n',
  'retry-loops': '---\ncategories: [retry-loops]\nevidence: [whatChanged]\n' +
    'trigger: [rR]etr(?:y|ies)|[bB]ackoff\n---\n# R\n',
});
const GIT_USER = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];

/**
 * Write the fixture templates into a fixture tree (no commit), for a fixture
 * that commits them as part of its own change.
 * @param {string} root
 */
function writeTemplateFiles(root) {
  for (const [id, content] of Object.entries(FIXTURE_TEMPLATES)) {
    const file = path.join(root, TEMPLATE_DIR, `${id}.md`);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
  }
}

/**
 * Write the fixture templates into a fixture repository and commit them.
 * @param {string} root
 */
function writeVerificationTemplates(root) {
  writeTemplateFiles(root);
  execFileSync('git', [...GIT_USER, 'add', TEMPLATE_DIR], {cwd: root});
  execFileSync('git', [...GIT_USER, 'commit', '-q', '-m', 'templates'], {cwd: root});
}

/**
 * Record a reverted run's output as an evidence finding and cite its line.
 * @param {string} root
 * @param {string} questId
 * @param {string} output
 * @return {string} solve/quests/<id>/log.ndjson:<line>
 */
function recordEvidence(root, questId, output) {
  note(root, {id: questId, type: ENTRY_TYPE.FINDING, text: output, kind: FINDING_KIND.EVIDENCE});
  return `solve/quests/${questId}/log.ndjson:${readLog(root, questId).length}`;
}

/**
 * A red-on-revert bound to `change` ({reverted, witness, assertion}), its
 * evidence freshly recorded in the quest log.
 * @return {Object}
 */
function redOnRevert(root, questId, change, overrides = {}) {
  return {reverted: change.reverted, what: 'the fix under review', witness: change.witness,
    assertion: change.assertion,
    evidence: recordEvidence(root, questId,
      `reverted run: not ok 1 - ${change.assertion} (error: the fix was reverted)`),
    ...overrides};
}

/**
 * A complete record: one harness-fidelity entry and a census sample.
 * @return {Object}
 */
function completeRecord(root, questId, change, overrides = {}) {
  return {templates: [{id: 'harness-fidelity', redOnRevert: redOnRevert(root, questId, change)}],
    sampled: {census: ['caller a: re-reads after its wait'], history: ['4f61b4a32'],
      found: 'no sibling captures before a wait'}, ...overrides};
}

/**
 * Record a verification carrying `record` (none when undefined) the way the
 * CLI does: from a record file outside the repository.
 * @return {Object} the note result
 */
function verify(root, questId, record, {verifier = 'subagent:v1',
  verdict = VERDICT.APPROVE, text = 'verified'} = {}) {
  const fields = {id: questId, type: ENTRY_TYPE.VERIFICATION, text, verifier, verdict};
  if (record === undefined) return note(root, fields);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-verifier-'));
  try {
    const file = path.join(directory, 'record.json');
    fs.writeFileSync(file, JSON.stringify(record));
    return note(root, {...fields, evidence: file});
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

export {
  TEMPLATE_DIR, completeRecord, recordEvidence, redOnRevert, verify, writeTemplateFiles,
  writeVerificationTemplates,
};
