import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseRejectionFindings,
  rejectionFindingBarProblem,
  sealedVerificationTemplates,
  OUT_OF_BAR_PREFIX,
} from '../../scripts/solve/rejection-findings.js';
import {buildVerificationFinding} from '../../scripts/solve/verification.js';
import {runAmendCommand} from '../../scripts/solve/amend.js';
import {lintQuest} from '../../scripts/solve/quest-lint.js';
import {appendEvent, loadQuest, readLog, saveQuest}
  from '../../scripts/solve/store.js';
import {ensureSealedGoal} from '../../scripts/solve/loop.js';

const QUEST = Object.freeze({
  id: 'bar-demo',
  authoringContractVersion: 1,
  statement: 'The sealed bar bounds rejection categories.',
  class: 'process',
  priority: 1,
  doneWhen: {probe: 'oracle', args: {file: 'oracle.json'}},
  frontiers: [{
    id: 'bar-demo-main', priority: 1,
    metric: {probe: 'oracle', args: {file: 'oracle.json'}},
  }],
  constraints: [],
  verificationTemplates: ['adversarial-js-intrinsics'],
});

function declaredLog(extraEvents = []) {
  return [
    {type: 'quest-declared', sealed: {...QUEST}},
    ...extraEvents,
  ];
}

function rejectionEvent(findings) {
  return {
    type: 'finding',
    kind: 'verifier-rejection',
    frontier: 'bar-demo-main',
    verification: {findings},
  };
}

tap.test('parseRejectionFindings parses and fails closed', (t) => {
  t.same(parseRejectionFindings(undefined), []);
  t.same(
    parseRejectionFindings('correctness: totals were collapsed by pollution'),
    [{category: 'correctness', summary: 'totals were collapsed by pollution'}]);
  t.same(parseRejectionFindings([
    'adversarial-js-intrinsics: inherited toJSON changed the digest output',
    'out-of-bar:dimensional-consistency: zero lookups still charged one lookup',
  ]), [
    {category: 'adversarial-js-intrinsics',
      summary: 'inherited toJSON changed the digest output'},
    {category: `${OUT_OF_BAR_PREFIX}dimensional-consistency`,
      summary: 'zero lookups still charged one lookup'},
  ]);
  t.throws(() => parseRejectionFindings('no separator here'), /not usable/u);
  t.throws(() => parseRejectionFindings('correctness: short'), /not usable/u);
  t.throws(() => parseRejectionFindings('Bad Category: long enough summary'),
    /not usable/u);
  t.end();
});

tap.test('sealed bar is declaration plus bar-expansion amendments', (t) => {
  t.same(sealedVerificationTemplates(QUEST, declaredLog()),
    ['adversarial-js-intrinsics']);
  t.same(sealedVerificationTemplates(QUEST, declaredLog([{
    type: 'quest-amended',
    amendmentKind: 'verification-bar-expansion',
    template: 'harness-fidelity',
  }])), ['adversarial-js-intrinsics', 'harness-fidelity']);
  const unsealed = {...QUEST, verificationTemplates: undefined};
  t.same(sealedVerificationTemplates(unsealed, []), [],
    'no declaration event and no templates means no bar');
  t.end();
});

tap.test('bar problems: in-bar passes, out-of-bar passes once, repeat refused', (t) => {
  const log = declaredLog();
  t.equal(rejectionFindingBarProblem(QUEST, log, [
    {category: 'adversarial-js-intrinsics', summary: 'polluted Array iterator'},
  ]), null, 'declared category passes');
  t.match(rejectionFindingBarProblem(QUEST, log, [
    {category: 'dimensional-consistency', summary: 'zero lookups mischarged'},
  ]), /outside the sealed verification bar/u,
  'an undeclared bare category is refused with the expansion path');
  t.equal(rejectionFindingBarProblem(QUEST, log, [
    {category: `${OUT_OF_BAR_PREFIX}dimensional-consistency`,
      summary: 'zero lookups mischarged'},
  ]), null, 'first out-of-bar occurrence is the escape hatch');
  const repeatLog = declaredLog([rejectionEvent([
    {category: `${OUT_OF_BAR_PREFIX}dimensional-consistency`,
      summary: 'zero lookups mischarged'},
  ])]);
  t.match(rejectionFindingBarProblem(QUEST, repeatLog, [
    {category: `${OUT_OF_BAR_PREFIX}dimensional-consistency`,
      summary: 'still mischarged after fix'},
  ]), /requires expanding the sealed bar/u,
  'a repeated out-of-bar category demands the amendment');
  const expandedLog = declaredLog([
    rejectionEvent([
      {category: `${OUT_OF_BAR_PREFIX}dimensional-consistency`,
        summary: 'zero lookups mischarged'},
    ]),
    {type: 'quest-amended',
      amendmentKind: 'verification-bar-expansion',
      template: 'dimensional-consistency'},
  ]);
  t.equal(rejectionFindingBarProblem(QUEST, expandedLog, [
    {category: 'dimensional-consistency', summary: 'still mischarged after fix'},
  ]), null, 'the expanded bar admits the category directly');
  const unsealed = {...QUEST, verificationTemplates: undefined};
  t.equal(rejectionFindingBarProblem(unsealed, [], [
    {category: 'anything-goes', summary: 'free-form category without a bar'},
  ]), null, 'a quest without templates has no bar');
  t.end();
});

tap.test('buildVerificationFinding refuses a rejection without findings', (t) => {
  const shared = {
    kind: 'verifier-rejection',
    evidence: 'subagent:verify-demo',
    verificationScope: 'attempt',
    verificationFingerprint: `sha256:${'a'.repeat(64)}`,
  };
  t.throws(() => buildVerificationFinding(shared),
    /requires at least one categorized finding/u);
  t.throws(() => buildVerificationFinding({
    ...shared,
    rejectionFindings: [{category: 'correctness', summary: 'short'}],
  }), /requires at least one categorized finding/u);
  const built = buildVerificationFinding({
    ...shared,
    rejectionFindings: [
      {category: 'correctness', summary: 'paired values were never compared'},
    ],
  });
  t.same(built.findings,
    [{category: 'correctness', summary: 'paired values were never compared'}]);
  t.equal(built.verdict, 'rejected');
  t.end();
});

tap.test('quest lint validates verificationTemplates', (t) => {
  t.same(lintQuest(QUEST).errors, [], 'structural pass without a root');
  t.match(lintQuest({...QUEST, verificationTemplates: ['ok', '']}).errors
    .join('; '), /non-empty category slugs/u);
  t.match(lintQuest({...QUEST, verificationTemplates: ['dup', 'dup']}).errors
    .join('; '), /duplicates/u);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-lint-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const templateDir = path.join(root, 'docs/steering/verification-templates');
  fs.mkdirSync(templateDir, {recursive: true});
  fs.writeFileSync(path.join(templateDir, 'adversarial-js-intrinsics.md'),
    '---\ncategories: [adversarial-js-intrinsics]\n---\n');
  t.same(lintQuest(QUEST, {root}).errors, [], 'known category passes with root');
  t.match(lintQuest({...QUEST, verificationTemplates: ['unknown-one']}, {root})
    .errors.join('; '), /unknown category "unknown-one"/u);
  t.end();
});

tap.test('the production sealing path captures and guards the bar', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-seal-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  saveQuest(root, {...QUEST});
  const quest = loadQuest(root, QUEST.id);
  // The REAL declaration path, not a hand-crafted event: this is the seam
  // that silently dropped the bar before the seal captured it.
  ensureSealedGoal(root, quest);
  const log = readLog(root, QUEST.id);
  t.same(sealedVerificationTemplates(quest, log),
    ['adversarial-js-intrinsics'],
    'the sealed declaration carries the declared bar');
  t.match(rejectionFindingBarProblem(quest, log, [
    {category: 'dimensional-consistency', summary: 'zero lookups mischarged'},
  ]), /outside the sealed verification bar/u,
  'the bar enforces through the production sealing path');
  const widened = {...loadQuest(root, QUEST.id),
    verificationTemplates: ['adversarial-js-intrinsics', 'sneaky-widening']};
  saveQuest(root, widened);
  t.throws(() => ensureSealedGoal(root, loadQuest(root, QUEST.id)),
    /verificationTemplates changed after declaration/u,
    'editing the bar in the quest file is a goalpost violation');
  t.end();
});

tap.test('amend expands the sealed bar with verifier evidence', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-amend-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const templateDir = path.join(root, 'docs/steering/verification-templates');
  fs.mkdirSync(templateDir, {recursive: true});
  for (const name of ['adversarial-js-intrinsics', 'dimensional-consistency']) {
    fs.writeFileSync(path.join(templateDir, `${name}.md`),
      `---\ncategories: [${name}]\n---\n`);
  }
  saveQuest(root, {...QUEST});
  appendEvent(root, QUEST.id, {type: 'quest-declared', sealed: {...QUEST}});
  appendEvent(root, QUEST.id, {
    type: 'finding',
    frontier: 'bar-demo-main',
    kind: 'verifier-rejection',
    claim: 'zero lookups were still charged one lookup by the sealed model',
    evidence: 'subagent:verify-demo',
  });
  t.throws(() => runAmendCommand(root, {
    id: QUEST.id,
    kind: 'verification-bar-expansion',
    template: 'Not A Slug',
    evidence: 'subagent:verify-demo',
  }), /--template <kebab-case-category>/u);
  t.throws(() => runAmendCommand(root, {
    id: QUEST.id,
    kind: 'verification-bar-expansion',
    template: 'adversarial-js-intrinsics',
    evidence: 'subagent:verify-demo',
  }), /already in the sealed bar/u);
  t.match(runAmendCommand(root, {
    id: QUEST.id,
    kind: 'verification-bar-expansion',
    template: 'dimensional-consistency',
    evidence: 'subagent:verify-demo',
  }), /verification-bar-expansion/u);
  t.same(loadQuest(root, QUEST.id).verificationTemplates,
    ['adversarial-js-intrinsics', 'dimensional-consistency'],
    'the quest file carries the expanded bar');
  t.end();
});
