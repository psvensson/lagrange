// `solve next --id <quest>` — a thin, human-readable "what do I do next?"
// renderer. It FOLDS the existing read-models (pending supervised step, the
// last recorded gate stop, the current-blocker card, quest advisories) and
// derives nothing new; every line here is available elsewhere as JSON.
//
// Output contract: a handful of lines, the FIRST always a single imperative
// `Next: <command or action>`.

import {loadQuest, readLog, projectState} from './store.js';
import {stepPending} from './step.js';
import {buildCurrentBlocker, blockerLabel} from './current-blocker.js';
import {analyzeQuestHealth} from './health.js';
import {buildAdvisories, renderAdvisoryLines} from './advisories.js';
import {buildSealFreshnessAdvisory} from './seal-freshness.js';
import {
  EVENT_GATE_DECISION,
  OUTCOME_CONTINUE,
  STATUS_SOLVED,
  STATUS_EXHAUSTED,
} from './constants.js';

const TERMINAL_STATUSES = Object.freeze([STATUS_SOLVED, STATUS_EXHAUSTED]);

// The last event, when it is a recorded non-terminal gate stop (an advisory
// gate-decision means the run continued, so it is not a stop). Anything after
// the stop (an attempt, fresh evidence) supersedes it, hence last-event-only.
function lastEventGateStop(log) {
  const last = log.length > 0 ? log[log.length - 1] : null;
  if (last && last.type === EVENT_GATE_DECISION &&
    last.outcome !== OUTCOME_CONTINUE) {
    return last;
  }
  return null;
}

function pendingCommitCommand(questId) {
  return `node scripts/solve.js step --id ${questId} --commit --auto-diff ` +
    '--summary "<what changed>" (or --changeRef diff:<path>; ' +
    `step --id ${questId} --abort discards)`;
}

function nextImperative({questId, state, pending, gateStop, blocker}) {
  if (TERMINAL_STATUSES.includes(state.questStatus)) {
    return `nothing to execute — quest is ${state.questStatus.toUpperCase()}; ` +
      `review node scripts/solve.js report --id ${questId}`;
  }
  if (pending) return pendingCommitCommand(questId);
  if (gateStop && gateStop.nextCommand) return gateStop.nextCommand;
  return blocker.nextAction;
}

export function buildNextLines(root, questId) {
  const quest = loadQuest(root, questId);
  const log = readLog(root, questId);
  const state = projectState(quest, log);
  const pending = stepPending(root, questId);
  const blocker = buildCurrentBlocker({quest, log, state});
  const gateStop = lastEventGateStop(log);
  const health = analyzeQuestHealth(root, quest, {state});
  const advisories = buildAdvisories(quest, health, log);
  const sealFreshness = buildSealFreshnessAdvisory(quest, log, {root});
  if (sealFreshness) advisories.push(sealFreshness);

  const lines = [
    `Next: ${nextImperative({questId, state, pending, gateStop, blocker})}`,
    `quest: ${questId} (${state.questStatus})`,
  ];
  if (pending) {
    lines.push(`pending step: ${pending.frontier} pinned at metric ` +
      `${pending.before?.metric ?? '?'} — commit or abort it before a new step`);
  }
  if (gateStop) {
    const problem = (gateStop.problems || [])[0];
    lines.push(`last stop: ${gateStop.code || gateStop.outcome} ` +
      `(${gateStop.disposition})${problem ? ` — ${problem}` : ''}`);
  }
  lines.push(`blocker: ${blockerLabel(blocker)} — ${blocker.movementSummary}`);
  lines.push(...renderAdvisoryLines(advisories));
  return lines;
}

export function runNextCommand(root, questId) {
  return `${buildNextLines(root, questId).join('\n')}\n`;
}
