// Reattempt — first-class replacement attempt for a quest whose landing
// candidate must be replaced (stale recorded bytes, rejected fingerprint).
//
// Before this verb a replacement attempt was a hand-built ritual: regenerate
// dependencies, stage intent for untracked files, remember the previous
// attempt's theory/model fields, build a canonical diff against the right
// pin, and drive the step machinery — measured 2026-09-01: a hand-built
// replacement omitted a regenerated dependency and cost a full land/override
// cycle. Reattempt automates exactly that ritual through the SAME gates:
// stepBegin pins the base (rejection pin, then epoch, then HEAD), auto-diff
// owns the artifact, and commitPendingAttempt applies every admission gate
// unchanged. Nothing is bypassed.

import {spawnSync} from 'node:child_process';

import {untrackedSourcePaths} from './auto-diff.js';
import {regenerateGeneratedOutputsAtRoot} from './generated-dependencies.js';
import {loadPending} from './pending-step.js';
import {runStep} from './step.js';
import {readLog} from './store.js';
import {questContractExcludesCollateral} from './verification.js';

const REATTEMPT_ID_REQUIRED = 'reattempt: --id <questId> is required';
const REATTEMPT_NO_ATTEMPT =
  'reattempt: no recorded attempt to replace — use `solve step` or ' +
  '`solve attempt` for a first attempt';
const REATTEMPT_EXHAUSTED =
  'reattempt: could not pin a frontier for the replacement attempt';
const EVENT_ATTEMPT = 'attempt';
const GIT_BINARY = 'git';
const GIT_ADD_INTENT_ARGUMENTS = Object.freeze(['add', '-N', '--']);
const GIT_OUTPUT_ENCODING = 'utf8';
const STAGED_INTENT_PREFIX = 'reattempt: staged intent-to-add for ';
const PATH_LIST_SEPARATOR = ', ';
const LINE_SEPARATOR = '\n';
const DEFAULT_SUMMARY = 'replacement attempt (reattempt)';
const INTENT_STAGE_FAILED_PREFIX =
  'reattempt: git add -N failed: ';
const UNKNOWN_GIT_ERROR = 'unknown error';

function latestAttemptEvent(log) {
  return [...log].reverse().find((event) => event.type === EVENT_ATTEMPT);
}

// git diff never sees untracked files; reattempt exists to remove exactly
// this class of silent omission, so it stages intent itself and reports it.
function stageUntrackedIntent(root, actions) {
  const untracked = untrackedSourcePaths(root);
  if (untracked.length === 0) return;
  const staged = spawnSync(GIT_BINARY,
    [...GIT_ADD_INTENT_ARGUMENTS, ...untracked],
    {cwd: root, encoding: GIT_OUTPUT_ENCODING});
  if (staged.status !== 0) {
    throw new Error(INTENT_STAGE_FAILED_PREFIX +
      (staged.stderr || UNKNOWN_GIT_ERROR).trim());
  }
  actions.push(
    STAGED_INTENT_PREFIX + untracked.join(PATH_LIST_SEPARATOR));
}

// Inherit theory/model fields from the most recent recorded attempt unless
// the operator overrides them: a replacement re-seals the same claim.
function inheritedAttemptFields(latest, args) {
  return {
    theoryRef: args.theoryRef || latest.theoryRef || null,
    modelRef: args.modelRef || latest.modelRef || null,
    modelNotApplicable: args.modelNotApplicable ||
      latest.modelNotApplicable || null,
  };
}

export function runReattemptCommand(root, args, loadQuest) {
  const id = args.id || args._[0];
  if (!id) throw new Error(REATTEMPT_ID_REQUIRED);
  const quest = loadQuest(root, id);
  const log = readLog(root, id);
  const latest = latestAttemptEvent(log);
  if (!latest) throw new Error(REATTEMPT_NO_ATTEMPT);
  const actions = [];
  // Byte-contract quests must carry fresh registered outputs inside the
  // artifact; collateral-contract quests exclude them and the landing
  // regenerates, so regeneration here would only burn time.
  if (!questContractExcludesCollateral(quest)) {
    regenerateGeneratedOutputsAtRoot(root);
  }
  stageUntrackedIntent(root, actions);
  if (!loadPending(root, id)) {
    const begun = runStep(root, quest, {allowSolvedReattempt: true});
    if (begun.terminal) throw new Error(REATTEMPT_EXHAUSTED);
  }
  const result = runStep(root, quest, {
    autoDiff: true,
    allowSolvedReattempt: true,
    summary: args.summary || DEFAULT_SUMMARY,
    ...inheritedAttemptFields(latest, args),
  });
  return {result, actions,
    output: actions.length > 0 ?
      actions.join(LINE_SEPARATOR) + LINE_SEPARATOR : ''};
}
