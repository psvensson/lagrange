import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {git, gitRaw, initializeGitFixtureRoot, writeFile}
  from './git-fixture-helpers.js';

import {runReattemptCommand} from '../../scripts/solve/reattempt.js';
import {runStep} from '../../scripts/solve/step.js';
import {loadQuest, readLog, saveQuest} from '../../scripts/solve/store.js';
import {inspectChangeArtifact} from '../../scripts/solve/change-artifact.js';

// Reattempt is the first-class replacement attempt: it stages intent for
// untracked sources, snapshots the worktree through the shared auto-diff
// owner, inherits theory/model fields from the replaced attempt, and records
// through the UNCHANGED step gates — including for a SOLVED quest whose
// landing candidate must be replaced.

const TMP_PREFIX = 'solver-reattempt-';
const QUEST_ID = 'reattempt-fixture';
const FRONTIER_ID = `${QUEST_ID}-main`;
const SOURCE_A = 'src/a.js';
const SOURCE_A_BASE = 'export const a = 1;\n';
const SOURCE_A_CANDIDATE = 'export const a = 2;\n';
const SOURCE_A_REPLACEMENT = 'export const a = 3;\n';
const NEW_HELPER = 'src/helper.js';
const NEW_HELPER_CONTENT = 'export const helper = true;\n';
const ORACLE_GREEN = {metric: 0, target: 0};
const ORACLE_OPEN = {metric: 2, target: 0};
const MODEL_NOT_APPLICABLE = 'workflow-machinery change, no runtime model';
const MODEL_NOT_APPLICABLE_OVERRIDE = 'different reason on the replacement';
const GIT_DIFF_ARGUMENTS = Object.freeze([
  'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--',
]);
const EVENT_ATTEMPT = 'attempt';

function fixture(t) {
  const root = initializeGitFixtureRoot(t, TMP_PREFIX);
  writeFile(root, SOURCE_A, SOURCE_A_BASE);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const oracleFile = path.join(root, 'solve', 'oracle', `${QUEST_ID}.json`);
  fs.mkdirSync(path.dirname(oracleFile), {recursive: true});
  fs.writeFileSync(oracleFile, JSON.stringify(ORACLE_OPEN));
  const metric = {probe: 'oracle', args: {file: oracleFile}};
  const quest = {
    id: QUEST_ID,
    authoringContractVersion: 1,
    // Collateral contract: reattempt skips dependency regeneration and the
    // artifact excludes registered outputs.
    verificationContractVersion: 3,
    statement: 'The reattempt fixture reaches zero.',
    priority: 1,
    class: 'process',
    doneWhen: metric,
    frontiers: [{id: FRONTIER_ID, priority: 1, metric}],
    constraints: [],
  };
  saveQuest(root, quest);
  return {root, quest, oracleFile};
}

function canonicalArtifact(root, name, paths) {
  const relative = `solve/changes/${QUEST_ID}/${name}.diff`;
  writeFile(root, relative, gitRaw(root, [...GIT_DIFF_ARGUMENTS, ...paths]));
  return `diff:${relative}`;
}

// A recorded first attempt (with a model disclaimer) that closes the quest
// SOLVED.
function solvedQuest(t) {
  const fx = fixture(t);
  assert.equal(runStep(fx.root, fx.quest).terminal, null);
  writeFile(fx.root, SOURCE_A, SOURCE_A_CANDIDATE);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_GREEN));
  const changeRef = canonicalArtifact(fx.root, 'attempt-1', [SOURCE_A]);
  const recorded = runStep(fx.root, fx.quest,
    {changeRef, summary: 'first', modelNotApplicable: MODEL_NOT_APPLICABLE});
  assert.equal(recorded.done, true, 'the first attempt closes the quest');
  return fx;
}

function attemptEvents(root) {
  return readLog(root, QUEST_ID)
    .filter((event) => event.type === EVENT_ATTEMPT);
}

test('reattempt-solved-quest-records-replacement: a SOLVED quest gains a ' +
  'replacement attempt covering the worktree delta, with intent staged ' +
  'for untracked files and theory fields inherited', (t) => {
  const fx = solvedQuest(t);
  writeFile(fx.root, SOURCE_A, SOURCE_A_REPLACEMENT);
  writeFile(fx.root, NEW_HELPER, NEW_HELPER_CONTENT);
  const {result, actions} = runReattemptCommand(
    fx.root, {id: QUEST_ID}, loadQuest);
  assert.ok(result.changeRef, 'the replacement seals an artifact');
  const events = attemptEvents(fx.root);
  assert.equal(events.length, 2, 'one replacement attempt is recorded');
  const replacement = events[events.length - 1];
  assert.equal(replacement.modelNotApplicable, MODEL_NOT_APPLICABLE,
    'the replacement inherits the replaced attempt model fields');
  const inspection = inspectChangeArtifact(
    fx.root, fx.quest, result.changeRef);
  assert.deepEqual([...inspection.changedPaths].sort(),
    [SOURCE_A, NEW_HELPER].sort(),
    'the artifact covers exactly the worktree delta');
  assert.ok(actions.some((action) => action.includes(NEW_HELPER)),
    'the staged intent-to-add action is reported');
});

test('reattempt-requires-a-recorded-attempt: a quest with no attempt ' +
  'refuses with a typed message', (t) => {
  const fx = fixture(t);
  assert.throws(() => runReattemptCommand(fx.root, {id: QUEST_ID}, loadQuest),
    /no recorded attempt to replace/u);
});

test('reattempt-explicit-fields-override-inheritance: CLI model fields ' +
  'win over the replaced attempt', (t) => {
  const fx = solvedQuest(t);
  writeFile(fx.root, SOURCE_A, SOURCE_A_REPLACEMENT);
  runReattemptCommand(fx.root,
    {id: QUEST_ID, modelNotApplicable: MODEL_NOT_APPLICABLE_OVERRIDE},
    loadQuest);
  const events = attemptEvents(fx.root);
  assert.equal(events[events.length - 1].modelNotApplicable,
    MODEL_NOT_APPLICABLE_OVERRIDE);
});
