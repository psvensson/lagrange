// The four v2 commands over a scratch git repository: start refuses a green
// probe and records the seal-time value; note needs a seal for attempts;
// land honors the last verdict, requires verification for src/, enforces the
// altitude budget and the epic scope, then commits and records solved.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  ENTRY_TYPE, FINDING_KIND, NEXT_OWNER, PROBE, QUEST_SCHEMA, QUEST_STATUS, VERDICT,
} from '../../scripts/solve/schema.js';
import {readLog, readQuest} from '../../scripts/solve/store.js';
import {
  ALTITUDE_BUDGET, SolveError, board, land, landChangeProofEnvironment, note,
  probe, runChangeProof, start,
} from '../../scripts/solve/commands.js';
import {
  CHECK_BASE_ENV, RANGE_SOURCE,
} from '../../scripts/checks/change-selection-constants.js';
import {resolvedCheckRange} from '../../scripts/checks/changed-paths.js';
import {
  RETRY_FAILED_ONCE_ENABLED, RETRY_FAILED_ONCE_ENV,
} from '../../scripts/run-test-files.js';
import {readVerificationRecord, verificationRecordProblems} from '../../scripts/solve/guards.js';
import {
  TEMPLATE_DIR, completeRecord as fixtureCompleteRecord, recordEvidence,
  redOnRevert as fixtureRedOnRevert, verify, writeVerificationTemplates,
} from './verification-record-fixture.js';

const QUEST_ID = 'demo';
const EPIC_ID = 'demo-epic';
const ORACLE = `solve/quests/${QUEST_ID}/evidence/oracle.json`;
const STATEMENT = 'The demo metric reaches zero.';
const VERIFIER = 'subagent:v1';
const SRC_FILE = 'src/thing.js';
const DOC_FILE = 'docs/thing.md';
const OUTSIDE_FILE = 'other/thing.txt';
const TEXT = 'note';
const GIT_USER = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];

function git(root, args) {
  return execFileSync('git', [...GIT_USER, ...args], {cwd: root, encoding: 'utf8'});
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function repo(t, {metric = 1, legacy = false} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-cmd-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init', '-q']);
  // The code under test commits through this repository, and a machine
  // without a global git identity (any CI runner) would otherwise refuse.
  git(root, ['config', 'user.name', 'lagrange-test']);
  git(root, ['config', 'user.email', 'lagrange-test@example.com']);
  write(root, 'solve/epics/demo-epic.md', ['---', `id: ${EPIC_ID}`, 'status: open',
    'proof: deterministic', legacy ? 'legacy: true' : 'doneWhen:',
    ...(legacy ? [] : ['  probe: oracle', '  args:', `    file: ${ORACLE}`]),
    'quests:', `  - ${QUEST_ID}`, 'authorizes:', '  - src/**', '  - docs/**', '  - test/**',
    '---', '',
    '# Demo', ''].join('\n'));
  write(root, `solve/quests/${QUEST_ID}/quest.json`, JSON.stringify({
    schema: QUEST_SCHEMA, id: QUEST_ID, statement: STATEMENT, epic: EPIC_ID,
    doneWhen: {probe: PROBE.ORACLE, args: {file: ORACLE}},
  }));
  write(root, ORACLE, JSON.stringify({metric, target: 0}));
  write(root, '.gitkeep', '');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'seed']);
  return root;
}

function refuses(fn, pattern) {
  assert.throws(fn, (error) => error instanceof SolveError && pattern.test(error.message),
    `expected refusal matching ${pattern}`);
}

function goGreen(root) {
  write(root, ORACLE, JSON.stringify({metric: 0, target: 0}));
}

// --- the verification record of a src/ approval ---------------------------------
const WITNESS_FILE = 'test/thing.test.js';
const ASSERTION = 'dispatch reads the routable set after the wait';
const CHANGE = Object.freeze({reverted: SRC_FILE, witness: WITNESS_FILE, assertion: ASSERTION});

function templates(root) {
  writeVerificationTemplates(root);
}

// A scratch file outside the repository, as a verifier's scratchpad is.
function scratch(t, name, content) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-verifier-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, name);
  fs.writeFileSync(file, content);
  return file;
}

function logEvidence(root, output) {
  return recordEvidence(root, QUEST_ID, output);
}

function redOnRevert(root, overrides = {}) {
  return fixtureRedOnRevert(root, QUEST_ID, CHANGE, overrides);
}

function completeRecord(root, overrides = {}) {
  return fixtureCompleteRecord(root, QUEST_ID, CHANGE, overrides);
}

function approve(t, root, record, verdict = VERDICT.APPROVE) {
  return verify(root, QUEST_ID, record, {verifier: VERIFIER, verdict, text: TEXT});
}

// A sealed, green quest whose attempt changes src/ and adds its witness.
function sourceQuest(t, source = TEXT) {
  const root = repo(t);
  templates(root);
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, SRC_FILE, source);
  write(root, WITNESS_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  return root;
}

test('start refuses a green or non-measuring probe; a red one seals', (t) => {
  refuses(() => start(repo(t, {metric: 0}), {id: QUEST_ID}), /green probe/u);
  const unmeasured = repo(t);
  fs.unlinkSync(path.join(unmeasured, ORACLE));
  refuses(() => start(unmeasured, {id: QUEST_ID}), /does not measure/u);
  const root = repo(t);
  const sealed = start(root, {id: QUEST_ID});
  assert.match(sealed.sealedAt, /^[0-9a-f]{40}$/u);
  assert.equal(readQuest(root, QUEST_ID).sealedAt, sealed.sealedAt);
  const log = readLog(root, QUEST_ID);
  assert.equal(log[0].seal.metric, 1);
  refuses(() => start(root, {id: QUEST_ID}), /already sealed/u);
  refuses(() => start(root, {id: 'missing'}), /no quest/u);
});

test('note: attempts need a seal; findings, verifications and blocked entries record', (t) => {
  const root = repo(t);
  refuses(() => note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT}), /not sealed/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, text: TEXT, kind: FINDING_KIND.THEORY,
    status: 'active'});
  start(root, {id: QUEST_ID});
  write(root, DOC_FILE, TEXT);
  const attempt = note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  assert.deepEqual(attempt.entry.paths, [DOC_FILE]);
  assert.equal(attempt.entry.pathCount, 1);
  assert.equal(attempt.entry.truncated, undefined);
  refuses(() => note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, text: TEXT, kind: 'vibes'}),
    /kind/u);
  refuses(() => note(root, {id: QUEST_ID, type: ENTRY_TYPE.TERMINAL, text: TEXT,
    status: QUEST_STATUS.SOLVED}), /land/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.TERMINAL, text: TEXT, status: QUEST_STATUS.BLOCKED,
    nextOwner: NEXT_OWNER.JUDGMENT});
  const shown = probe(root, {id: QUEST_ID});
  assert.equal(shown.status, QUEST_STATUS.BLOCKED);
  assert.equal(shown.delta, 0);
  assert.equal(shown.recent.length, 3);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.TERMINAL, text: TEXT, status: QUEST_STATUS.EXHAUSTED});
  refuses(() => note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT}), /exhausted/u);
});

test('land: red probe, standing rejection, src without verification, altitude, scope', (t) => {
  const root = repo(t);
  templates(root);
  start(root, {id: QUEST_ID});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /not green/u);
  goGreen(root);
  write(root, SRC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /src\/ changes need a verification/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.REJECT});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /rejection/u);
  for (let index = 0; index <= ALTITUDE_BUDGET; index += 1) {
    note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  }
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /altitude-check/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, text: TEXT,
    kind: FINDING_KIND.ALTITUDE_CHECK});
  write(root, OUTSIDE_FILE, TEXT);
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /outside epic/u);
  fs.unlinkSync(path.join(root, OUTSIDE_FILE));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /names no verification template/u);
  write(root, WITNESS_FILE, TEXT);
  approve(t, root, completeRecord(root));
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  assert.match(landed.commit, /^[0-9a-f]{40}$/u);
  assert.deepEqual(landed.paths, [SRC_FILE, WITNESS_FILE]);
  assert.equal(git(root, ['status', '--porcelain']).trim(), '', 'everything committed');
  assert.match(git(root, ['log', '-1', '--format=%B']), new RegExp(`Quest: ${QUEST_ID}`, 'u'));
  const state = readLog(root, QUEST_ID).at(-1);
  assert.equal(state.type, ENTRY_TYPE.TERMINAL);
  assert.equal(state.status, QUEST_STATUS.SOLVED);
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /solved/u);
});

test('a src/ approval that names no verification template is refused, naming it', (t) => {
  const root = sourceQuest(t);
  approve(t, root);
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /approving verification names no verification template.*admissible: harness-fidelity, retry-loops/u);
  approve(t, root, {sampled: completeRecord(root).sampled});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /names no verification template/u);
  assert.equal(probe(root, {id: QUEST_ID}).status, QUEST_STATUS.OPEN, 'an approve is not an approval');
});

test('a src/ approval naming a template without its red-on-revert is refused, naming it', (t) => {
  const root = sourceQuest(t);
  approve(t, root, completeRecord(root, {templates: [{id: 'harness-fidelity'}]}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /carries no red-on-revert .*for template harness-fidelity/u);
  const partial = redOnRevert(root);
  delete partial.assertion;
  delete partial.what;
  approve(t, root, completeRecord(root, {templates: [{id: 'harness-fidelity', redOnRevert: partial}]}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /red-on-revert of harness-fidelity lacks what, assertion/u);
});

test('an unknown template id is refused at note, and at land once its template is gone', (t) => {
  const root = sourceQuest(t);
  const vibes = completeRecord(root, {templates: [{id: 'vibes', redOnRevert: redOnRevert(root)}]});
  const before = readLog(root, QUEST_ID).length;
  refuses(() => approve(t, root, vibes), /unknown verification template vibes; admissible: /u);
  assert.equal(readLog(root, QUEST_ID).length, before, 'nothing is recorded');
  refuses(() => approve(t, root, {templates: ['harness-fidelity', 'gut-feel']}),
    /unknown verification template gut-feel/u);
});

test('the admissible templates are the template files themselves', (t) => {
  const root = sourceQuest(t);
  const owner = {templates: [{id: 'owner-interaction', redOnRevert: redOnRevert(root)}]};
  refuses(() => approve(t, root, completeRecord(root, owner)),
    /unknown verification template owner-interaction/u);
  write(root, `${TEMPLATE_DIR}/owner-interaction.md`,
    '---\ncategories: [owner-interaction]\n---\n# O\n');
  approve(t, root, completeRecord(root, owner));
  fs.unlinkSync(path.join(root, `${TEMPLATE_DIR}/owner-interaction.md`));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /unknown verification template owner-interaction; admissible: harness-fidelity, retry-loops$/mu);
  fs.unlinkSync(path.join(root, `${TEMPLATE_DIR}/harness-fidelity.md`));
  write(root, `${TEMPLATE_DIR}/owner-interaction.md`,
    '---\ncategories: [owner-interaction]\n---\n# O\n');
  approve(t, root, completeRecord(root, owner));
  refuses(() => approve(t, root, completeRecord(root)), /unknown verification template harness-fidelity/u);
  catalogFailsClosed(t);
  repositoryCatalogIsClean();
});

test('a red-on-revert must bind the quest\'s own change, witness and evidence', (t) => {
  const root = sourceQuest(t);
  const scratchRun = scratch(t, 'revert.out', `not ok 1 - ${ASSERTION}\n`);
  const cases = [
    [{reverted: 'src/elsewhere.js'}, /reverted path is not in the quest's production-surface change set: src\/elsewhere\.js/u],
    [{witness: 'test/ghost.test.js'}, /witness is not a file in the tree: test\/ghost\.test\.js/u],
    [{witness: '.gitkeep'}, /witness is neither in the quest's change set nor in its receipts: \.gitkeep/u],
    [{evidence: scratchRun}, /evidence is not a file in the tree .*revert\.out/u],
    [{evidence: '../outside/revert.out'}, /evidence is not a file in the tree/u],
    [{evidence: `/${logEvidence(root, `not ok 1 - ${ASSERTION}`)}`}, /evidence is not a file in the tree/u],
    [{evidence: logEvidence(root, 'exit status 1')}, /evidence does not name the assertion/u],
  ];
  for (const [override, pattern] of cases) {
    approve(t, root, completeRecord(root, {templates: [{id: 'harness-fidelity',
      redOnRevert: redOnRevert(root, override)}]}));
    refuses(() => land(root, {id: QUEST_ID, skipProof: true}), pattern);
  }
  const header = logEvidence(root, 'header line of the reverted run');
  approve(t, root, completeRecord(root, {templates: [{id: 'harness-fidelity',
    redOnRevert: redOnRevert(root, {evidence: header})}]}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /does not name the assertion/u);
  approve(t, root, completeRecord(root, {templates: [{id: 'harness-fidelity',
    redOnRevert: redOnRevert(root, {evidence: `solve/quests/${QUEST_ID}/log.ndjson:9999`})}]}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /evidence has no such line/u);
  approve(t, root, completeRecord(root));
  assert.match(land(root, {id: QUEST_ID, skipProof: true}).commit, /^[0-9a-f]{40}$/u);
  cheapFakesAreRefused(t);
  blankFieldsAndOutsidePathsAreRefused(t);
});

test('a src/ approval samples the author\'s census and history or proves locality', (t) => {
  const root = sourceQuest(t);
  approve(t, root, completeRecord(root, {sampled: undefined}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /neither a sample of the author's census/u);
  approve(t, root, completeRecord(root, {sampled: {census: ['row'], history: [], found: 'x'}}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /neither a sample/u);
  approve(t, root, completeRecord(root, {sampled: undefined,
    local: {proof: 'no sibling', census: scratch(t, 'census.txt', 'grep: 1 hit\n')}}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /locality census: evidence is not a file in the tree/u);
  // A census cited by a line that holds nothing (past the last row's newline).
  write(root, 'docs/census.md', 'grep -rn: 1 hit, this one\n');
  approve(t, root, completeRecord(root, {sampled: undefined,
    local: {proof: 'no sibling', census: 'docs/census.md:2'}}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /locality census: evidence has no such line: docs\/census\.md:2/u);
  fs.unlinkSync(path.join(root, 'docs/census.md'));
  approve(t, root, completeRecord(root, {sampled: undefined,
    local: {proof: 'no sibling', census: logEvidence(root, 'grep -rn: 1 hit, this one')}}));
  assert.match(land(root, {id: QUEST_ID, skipProof: true}).commit, /^[0-9a-f]{40}$/u);
});

test('a change adding a retry names the retry template and what changed between attempts', (t) => {
  const root = sourceQuest(t, 'scheduleRetry(operation, backoffMs);\n');
  approve(t, root, completeRecord(root));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /does not name template retry-loops, whose trigger the change's added code matches/u);
  const retry = {id: 'retry-loops', redOnRevert: redOnRevert(root)};
  approve(t, root, completeRecord(root, {templates: [...completeRecord(root).templates, retry]}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /template retry-loops lacks whatChanged \(its template demands it/u);
  approve(t, root, completeRecord(root, {templates: [{...retry,
    whatChanged: 'the second attempt reads the row the owner wrote after the first failed'}]}));
  assert.match(land(root, {id: QUEST_ID, skipProof: true}).commit, /^[0-9a-f]{40}$/u);
  triggerMatchesCodeOnly(t);
});

function cheapFakesAreRefused(t) {
  const root = sourceQuest(t);
  write(root, WITNESS_FILE, `test('${ASSERTION}', ...)\n`);
  write(root, SRC_FILE, `// ${ASSERTION}\n`);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const harness = (revert) => completeRecord(root, {templates: [{id: 'harness-fidelity',
    redOnRevert: redOnRevert(root, revert)}]});
  const refusedWith = (record, pattern) => {
    approve(t, root, record);
    refuses(() => land(root, {id: QUEST_ID, skipProof: true}), pattern);
  };
  refusedWith(harness({evidence: WITNESS_FILE}), /evidence is the witness itself: test\/thing\.test\.js/u);
  refusedWith(harness({evidence: `${WITNESS_FILE}:1`}), /evidence is the witness itself/u);
  refusedWith(harness({evidence: SRC_FILE}), /evidence is a production-surface file: src\/thing\.js/u);
  refusedWith(harness({witness: SRC_FILE}), /witness is a production-surface file, not a test: src\/thing\.js/u);
  const log = `solve/quests/${QUEST_ID}/log.ndjson`;
  refusedWith(harness({evidence: log}), /evidence cites a whole quest log/u);
  // The verification's own line: its embedded record carries the assertion.
  const selfCiting = harness({});
  const ownLine = readLog(root, QUEST_ID).length + 1;
  selfCiting.templates[0].redOnRevert.evidence = `${log}:${ownLine}`;
  refusedWith(selfCiting,
    /quest log line that is not an evidence finding recorded before this verification/u);
  assert.equal(readLog(root, QUEST_ID)[ownLine - 1].type, ENTRY_TYPE.VERIFICATION,
    'the cited line is the verification entry itself');
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, text: `not ok 1 - ${ASSERTION}`,
    kind: FINDING_KIND.DECISION});
  refusedWith(harness({evidence: `${log}:${readLog(root, QUEST_ID).length}`}),
    /not an evidence finding recorded before this verification/u);
  // An evidence finding recorded after the verification cannot support it.
  const later = harness({});
  later.templates[0].redOnRevert.evidence = `${log}:${readLog(root, QUEST_ID).length + 2}`;
  approve(t, root, later);
  logEvidence(root, `not ok 1 - ${ASSERTION}`);
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /not an evidence finding recorded before this verification/u);
  // In another quest's log, "before" is the timestamp.
  const other = 'solve/quests/other/log.ndjson';
  const otherEntry = (ts) => `${JSON.stringify({ts, type: ENTRY_TYPE.FINDING,
    kind: FINDING_KIND.EVIDENCE, text: `not ok 1 - ${ASSERTION}`})}\n`;
  write(root, other, `${otherEntry('2999-01-01T00:00:00.000Z')}${otherEntry('2000-01-01T00:00:00.000Z')}`);
  git(root, ['add', other]);
  git(root, ['commit', '-q', '-m', 'another quest\'s log', '--', other]);
  refusedWith(harness({evidence: `${other}:1`}), /not an evidence finding recorded before/u);
  approve(t, root, harness({evidence: `${other}:2`}));
  assert.match(land(root, {id: QUEST_ID, skipProof: true}).commit, /^[0-9a-f]{40}$/u);
}

function blankFieldsAndOutsidePathsAreRefused(t) {
  const root = sourceQuest(t);
  approve(t, root, completeRecord(root, {templates: [{id: 'harness-fidelity',
    redOnRevert: redOnRevert(root, {what: '   ', witness: ' \t '})}]}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /red-on-revert of harness-fidelity lacks what, witness/u);
  approve(t, root, completeRecord(root, {sampled: {census: ['row'], history: ['h'], found: '  '}}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /neither a sample/u);
  // A file outside the tree that does name the assertion, reached by '..'.
  const outside = scratch(t, 'revert.out', `not ok 1 - ${ASSERTION}\n`);
  const climbing = path.relative(root, outside);
  assert.ok(climbing.startsWith('..'), climbing);
  approve(t, root, completeRecord(root, {templates: [{id: 'harness-fidelity',
    redOnRevert: redOnRevert(root, {evidence: climbing})}]}));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /evidence is not a file in the tree/u);
}

function catalogFailsClosed(t) {
  const root = sourceQuest(t);
  approve(t, root, completeRecord(root));
  write(root, `${TEMPLATE_DIR}/zz-dup.md`, '---\ncategories: [zz-new, retry-loops]\n---\n# Z\n');
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /verification template id declared by two files: retry-loops \(docs\/development\/verification-templates\/retry-loops\.md and docs\/development\/verification-templates\/zz-dup\.md\)/u);
  fs.unlinkSync(path.join(root, `${TEMPLATE_DIR}/zz-dup.md`));
  write(root, `${TEMPLATE_DIR}/zz-bad.md`, '---\ncategories: [zz-bad]\ntrigger: (unclosed\n---\n# Z\n');
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /invalid trigger: docs\/development\/verification-templates\/zz-bad\.md/u);
  refuses(() => approve(t, root, completeRecord(root)), /invalid trigger: .*zz-bad\.md/u);
  fs.unlinkSync(path.join(root, `${TEMPLATE_DIR}/zz-bad.md`));
  assert.match(land(root, {id: QUEST_ID, skipProof: true}).commit, /^[0-9a-f]{40}$/u);
}

function repositoryCatalogIsClean() {
  const record = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-catalog-')), 'r.json');
  fs.writeFileSync(record, JSON.stringify({templates: [{id: 'retry-loops'}, {id: 'sweep-timer'},
    {id: 'harness-fidelity'}]}));
  assert.deepEqual(readVerificationRecord(process.cwd(), record).problems, []);
  fs.rmSync(path.dirname(record), {recursive: true, force: true});
}

function triggerMatchesCodeOnly(t) {
  const root = sourceQuest(t, ['// retry once the owner republishes', ' * backoff noted here',
    'const reason = \'retry later\';', 'const count = 1; // retry'].join('\n'));
  approve(t, root, completeRecord(root));
  assert.match(land(root, {id: QUEST_ID, skipProof: true}).commit, /^[0-9a-f]{40}$/u,
    'words in comments and strings do not trip the trigger');
  const coded = sourceQuest(t, 'await scheduleRetry(operation);\n');
  approve(t, coded, completeRecord(coded));
  refuses(() => land(coded, {id: QUEST_ID, skipProof: true}), /does not name template retry-loops/u);
  for (const placeholder of ['n/a', ' NONE ', '-', '  ']) {
    const retry = {id: 'retry-loops', whatChanged: placeholder, redOnRevert: redOnRevert(coded)};
    approve(t, coded, completeRecord(coded, {templates: [retry]}));
    refuses(() => land(coded, {id: QUEST_ID, skipProof: true}), /retry-loops lacks whatChanged/u);
  }
}

// The main admission judges a commit, not a working tree: the tree is the
// commit's blobs (`git ls-tree` answers full paths), the change set the
// commit's paths and the `+` lines of `git diff --unified=0 <parent> <commit>`
// over the production surface (src/ and vendor/), and a merge passes the
// paths it really changes against its first parent.
const VENDOR_FILE = 'vendor/lib/thing.js';
const PRODUCTION_PATHSPEC = ['--', 'src', 'vendor'];

function commitAll(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

function commitTree(root, commit) {
  return {
    read: (file) => {
      try {
        return git(root, ['show', `${commit}:${file}`]);
      } catch {
        return null;
      }
    },
    list: (directory) => git(root, ['ls-tree', '--name-only', commit, `${directory}/`])
      .split('\n').filter(Boolean),
  };
}

function judgeCommit(root, parent, commit, paths = null) {
  const changed = paths ?? git(root, ['diff', '--name-only', parent, commit]).split('\n')
    .filter(Boolean);
  const addedSourceLines = git(root, ['diff', '--no-color', '--unified=0', parent, commit,
    ...PRODUCTION_PATHSPEC]).split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
  const log = git(root, ['show', `${commit}:solve/quests/${QUEST_ID}/log.ndjson`])
    .split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return verificationRecordProblems(log, {paths: changed, addedSourceLines},
    commitTree(root, commit));
}

test('the record check judges a commit and a merge over src/ and vendor/', (t) => {
  const root = sourceQuest(t);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  write(root, VENDOR_FILE, 'scheduleRetry(operation);\n');
  const vendorChange = {...CHANGE, reverted: VENDOR_FILE};
  approve(t, root, completeRecord(root));
  const plain = commitAll(root, 'quest change');
  assert.match(judgeCommit(root, base, plain).join('\n'),
    /does not name template retry-loops, whose trigger the change's added code matches/u,
    'a vendor/ line the commit adds trips a trigger');
  assert.match(judgeCommit(root, base, plain, [VENDOR_FILE]).join('\n'),
    /names no verification template|does not name template retry-loops/u,
    'a vendor/-only change needs the record');
  const witnessInVendor = fixtureCompleteRecord(root, QUEST_ID, {...vendorChange,
    witness: VENDOR_FILE});
  approve(t, root, witnessInVendor);
  assert.match(judgeCommit(root, base, commitAll(root, 'vendor witness')).join('\n'),
    /witness is a production-surface file, not a test: vendor\/lib\/thing\.js/u);
  const retry = {id: 'retry-loops', whatChanged: 'the second attempt re-reads the owner row',
    redOnRevert: fixtureRedOnRevert(root, QUEST_ID, vendorChange)};
  approve(t, root, completeRecord(root, {templates: [retry]}));
  const complete = commitAll(root, 'complete record');
  assert.deepEqual(judgeCommit(root, base, complete), [], 'full ls-tree paths; a commit lands');
  // A merge: the quest's branch merged after main moved on.
  git(root, ['checkout', '-q', '-b', 'quest']);
  git(root, ['checkout', '-q', base]);
  write(root, DOC_FILE, TEXT);
  const moved = commitAll(root, 'main moves on');
  git(root, ['merge', '-q', '--no-ff', '-m', 'merge quest', 'quest']);
  const merge = git(root, ['rev-parse', 'HEAD']).trim();
  assert.deepEqual(judgeCommit(root, moved, merge), [], 'a merge judged on its real paths');
  assert.match(judgeCommit(root, moved, merge, ['src/']).join('\n'),
    /reverted path is not in the quest's production-surface change set: vendor\/lib\/thing\.js/u,
    'a surface literal in place of the merge\'s paths cannot bind the reverted path');
});

test('a complete src/ approval lands, and its record rides in the log', (t) => {
  const root = sourceQuest(t);
  approve(t, root, completeRecord(root));
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  assert.deepEqual(landed.paths, [SRC_FILE, WITNESS_FILE]);
  const verification = readLog(root, QUEST_ID).findLast((entry) =>
    entry.type === ENTRY_TYPE.VERIFICATION);
  assert.equal(verification.record.templates[0].id, 'harness-fidelity');
});

test('a rejection, a newer attempt and a complete approval land', (t) => {
  const root = sourceQuest(t);
  const refusal = () => {
    try {
      land(root, {id: QUEST_ID, skipProof: true});
    } catch (error) {
      return error.message;
    }
    return assert.fail('land did not refuse');
  };
  approve(t, root, undefined, VERDICT.REJECT);
  const rejected = refusal();
  assert.match(rejected, /newest verification is a rejection/u);
  assert.doesNotMatch(rejected, /verification template/u, 'a rejection needs no record');
  approve(t, root, completeRecord(root), VERDICT.REJECT);
  assert.match(refusal(), /newest verification is a rejection/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  approve(t, root);
  assert.match(refusal(), /names no verification template/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const stale = refusal();
  assert.match(stale, /newer than the last attempt/u);
  assert.doesNotMatch(stale, /verification template/u, 'a stale approval is judged stale only');
  approve(t, root, completeRecord(root));
  assert.match(land(root, {id: QUEST_ID, skipProof: true}).commit, /^[0-9a-f]{40}$/u);
});

test('a quest touching no src/ path lands on a bare approval, as before', (t) => {
  const root = repo(t);
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, DOC_FILE, TEXT);
  write(root, WITNESS_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  assert.deepEqual(landed.paths, [DOC_FILE, WITNESS_FILE]);
  assert.equal(readLog(root, QUEST_ID).at(-1).status, QUEST_STATUS.SOLVED);
});

test('a legacy epic carries no scope; docs-only landings need no verifier', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, OUTSIDE_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  assert.ok(landed.paths.includes(OUTSIDE_FILE));
  const shown = board(root);
  assert.equal(shown.quests.length, 0);
  assert.equal(shown.counts.quests, 1);
  assert.equal(shown.epics[0].legacy, true);
});

test('land refuses a blocked quest and a probe changed after the seal', (t) => {
  const root = repo(t);
  start(root, {id: QUEST_ID});
  goGreen(root);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.TERMINAL, text: TEXT, status: QUEST_STATUS.BLOCKED,
    nextOwner: NEXT_OWNER.AUTHORIZATION});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /blocked/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const drifted = {...readQuest(root, QUEST_ID),
    doneWhen: {probe: PROBE.ORACLE, args: {file: `${ORACLE}.other`}}};
  write(root, `solve/quests/${QUEST_ID}/quest.json`, JSON.stringify(drifted));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /immutable after start/u);
});

test('a refused commit takes the terminal entry back out', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const hooks = path.join(root, '.git', 'hooks');
  fs.mkdirSync(hooks, {recursive: true});
  fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nexit 1\n', {mode: 0o755});
  const before = readLog(root, QUEST_ID).length;
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /commit was refused/u);
  assert.equal(readLog(root, QUEST_ID).length, before, 'no solved entry survives');
  assert.equal(git(root, ['diff', '--cached', '--name-only']).trim(), '', 'nothing stays staged');
  assert.equal(probe(root, {id: QUEST_ID}).status, QUEST_STATUS.OPEN);
  fs.unlinkSync(path.join(hooks, 'pre-commit'));
  assert.match(land(root, {id: QUEST_ID, skipProof: true}).commit, /^[0-9a-f]{40}$/u);
});

test('the change proof runs against the tree that will be committed', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, DOC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  // A checker that reads the repository through `git ls-files` (the test
  // taxonomy liveness rules, the classification shards) must see the new
  // file while the proof runs, not after the commit.
  let trackedDuringProof = null;
  land(root, {id: QUEST_ID, runProof: () => {
    trackedDuringProof = git(root, ['ls-files', DOC_FILE]).trim();
  }});
  assert.equal(trackedDuringProof, DOC_FILE);
});

test('a failing change proof leaves nothing staged and the quest open', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, DOC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  refuses(() => land(root, {id: QUEST_ID, runProof: () => {
    throw new SolveError('npm test failed (exit 1)');
  }}), /npm test failed/u);
  assert.equal(git(root, ['diff', '--cached', '--name-only']).trim(), '',
    'a refused proof gives the index back');
  assert.equal(probe(root, {id: QUEST_ID}).status, QUEST_STATUS.OPEN);
});

test('the commit-time checks run before the proof and a miss costs no test run', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, DOC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  // A hook that refuses the staged tree the way the file-size ratchet does.
  write(root, '.githooks/pre-commit',
    'echo "Source oversized-file ratchet: 28/27 over 800 lines."; exit 1\n');
  let proofRan = false;
  refuses(() => land(root, {id: QUEST_ID, runProof: () => {
    proofRan = true;
  }}), /commit-time checks refused[\s\S]*oversized-file ratchet/u);
  assert.equal(proofRan, false, 'the proof never started');
  assert.equal(git(root, ['diff', '--cached', '--name-only']).trim(), '',
    'the index is given back');
  assert.equal(probe(root, {id: QUEST_ID}).status, QUEST_STATUS.OPEN);
  // The hook sees the staged tree and the landing marker the commit carries.
  write(root, '.githooks/pre-commit',
    '[ "$LAGRANGE_SOLVER_LANDING" = 1 ] && git diff --cached --name-only | grep -q docs/ ' +
    '&& exit 0; exit 1\n');
  const landed = land(root, {id: QUEST_ID, runProof: () => {
    proofRan = true;
  }});
  assert.equal(proofRan, true, 'a passing hook lets the proof run');
  assert.match(landed.commit, /^[0-9a-f]{40}$/u);
});

test('a path already staged as a deletion still lands', (t) => {
  const root = repo(t, {legacy: true});
  const doomed = 'docs/retired.md';
  write(root, doomed, TEXT);
  git(root, ['add', doomed]);
  git(root, ['commit', '-q', '-m', 'add the file the cutover deletes']);
  start(root, {id: QUEST_ID});
  goGreen(root);
  // `git rm` leaves the path in neither the working tree nor the index; a
  // bare `git add -- <path>` would refuse the pathspec outright.
  git(root, ['rm', '--quiet', doomed]);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  assert.ok(landed.paths.includes(doomed));
  assert.equal(git(root, ['status', '--porcelain']).trim(), '');
  assert.equal(git(root, ['ls-files', doomed]).trim(), '', 'the deletion is committed');
});

test('probe --epic measures the epic doneWhen', (t) => {
  const root = repo(t);
  const shown = probe(root, {epic: EPIC_ID});
  assert.equal(shown.probe.metric, 1);
  refuses(() => probe(root, {epic: 'nope'}), /no epic/u);
});

test('a large change set is recorded by size and a bounded sample', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  for (let index = 0; index < 60; index += 1) {
    write(root, `docs/bulk-${index}.md`, TEXT);
  }
  const attempt = note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  assert.equal(attempt.entry.pathCount, 60);
  assert.equal(attempt.entry.paths.length, 50);
  assert.equal(attempt.entry.truncated, true);
  goGreen(root);
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  const terminal = readLog(root, QUEST_ID).at(-1);
  assert.equal(terminal.pathCount, landed.paths.length);
  assert.equal(terminal.paths.length, 50);
  // The log stays small; the commit holds the exact set.
  assert.ok(fs.statSync(path.join(root, `solve/quests/${QUEST_ID}/log.ndjson`)).size < 16384);
});

test('the change proof is spawned against the quest delta, HEAD, and says so', () => {
  // The index land proves differs from HEAD by exactly the staged scope, so
  // HEAD names the quest delta; a branch carrying earlier landed quests would
  // otherwise prove them all again at every land (1927 tests for a one-file
  // repair, 2026-09-17). The spawn seam observes the environment the proof
  // really runs under, not only the helper that builds it.
  const spawned = [];
  const lines = [];
  const spawn = (command, args, options) => {
    spawned.push({command, args, options});
    return {status: 0, stdout: '', stderr: ''};
  };
  runChangeProof('/repo', (line) => lines.push(line), spawn);
  assert.equal(spawned.length, 1);
  assert.deepEqual([spawned[0].command, spawned[0].args], ['npm', ['test']]);
  assert.equal(spawned[0].options.cwd, '/repo');
  assert.equal(spawned[0].options.env[CHECK_BASE_ENV], 'HEAD',
    'the proof process carries the pinned base');
  assert.equal(spawned[0].options.env.PATH, process.env.PATH,
    'the rest of the environment is the caller\'s');
  assert.match(lines[0], /change proof base HEAD/u, 'the base is announced before the proof');
  // Through the one ladder the static layer and the selector share, that
  // environment resolves to HEAD as an ENVIRONMENT range, never a silent
  // publication default; an unqualified proof - the push gate's - keeps
  // the publication merge-base rung (decision 0538db5c7).
  assert.deepEqual(resolvedCheckRange(null, landChangeProofEnvironment({}), '/repo'),
    {base: 'HEAD', source: RANGE_SOURCE.ENVIRONMENT});
  const caller = {KEEP: 'me'};
  const landing = landChangeProofEnvironment(caller);
  assert.equal(landing.KEEP, 'me');
  assert.equal(caller[CHECK_BASE_ENV], undefined, 'the caller environment is not mutated');
});

test('the change proof runs under the recorded retry policy, as CI does', () => {
  // ci.yml, full-gate.yml and the canary export LAGRANGE_RETRY_FAILED_ONCE=1;
  // land ran without it, so a flake cost a whole re-land where CI would have
  // rerun the file once standalone, reported and capped (never hidden).
  // Local is now equal to CI, not weaker.
  const spawned = [];
  const lines = [];
  const spawn = (command, args, options) => {
    spawned.push(options);
    return {status: 0, stdout: '', stderr: ''};
  };
  runChangeProof('/repo', (line) => lines.push(line), spawn);
  assert.equal(spawned[0].env[RETRY_FAILED_ONCE_ENV], RETRY_FAILED_ONCE_ENABLED,
    'the proof process carries the retry-once policy');
  assert.equal(spawned[0].env[CHECK_BASE_ENV], 'HEAD', 'and still the quest-delta base');
  assert.match(lines[0], /rerun once/u, 'the policy is announced with the base');
  const caller = {};
  const landing = landChangeProofEnvironment(caller);
  assert.equal(landing[RETRY_FAILED_ONCE_ENV], RETRY_FAILED_ONCE_ENABLED);
  assert.equal(caller[RETRY_FAILED_ONCE_ENV], undefined, 'the caller environment is not mutated');
});
