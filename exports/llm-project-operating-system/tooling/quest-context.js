#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {evaluate} from './solve/probe.js';
import {readLog, loadQuest, projectState} from './solve/store.js';
import {stepPending} from './solve/step.js';
import {analyzeQuestHealth} from './solve/health.js';
import {detectUnrecordedEvidence} from './solve/evidence.js';

const QUEST_DIR = path.join('solve', 'quests');
const STATE_DIR = path.join('solve', 'state');
const JSON_EXTENSION = '.json';
const DEFAULT_ENCODING = 'utf8';
const STATUS_OPEN = 'open';
const FLAG_ID = '--id';
const FLAG_JSON = '--json';
const ENV_QUEST_ID = 'SOLVE_QUEST_ID';
const MAX_WORKTREE_LINES = 30;
const EMPTY = '';

function parseArgs(argv) {
  const parsed = {id: null, json: false};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === FLAG_JSON) {
      parsed.json = true;
    } else if (arg === FLAG_ID) {
      parsed.id = argv[index + 1] || null;
      index += 1;
    }
  }
  return parsed;
}

function questPath(root, id) {
  return path.join(root, QUEST_DIR, `${id}${JSON_EXTENSION}`);
}

function questIds(root) {
  const dir = path.join(root, QUEST_DIR);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(JSON_EXTENSION))
    .map((name) => name.slice(0, -JSON_EXTENSION.length))
    .sort();
}

function pendingPath(root, id) {
  return path.join(root, STATE_DIR, `${id}.pending.json`);
}

function mtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (_error) {
    return 0;
  }
}

function questSummary(root, id) {
  const quest = loadQuest(root, id);
  const state = projectState(quest, readLog(root, id));
  const pending = stepPending(root, id);
  const probe = evaluate(quest.doneWhen, {root});
  const health = analyzeQuestHealth(root, quest, {state, liveProbe: probe});
  return {id, quest, state, pending, probe, health};
}

function selectQuest(root, explicitId) {
  const envId = process.env[ENV_QUEST_ID] || null;
  const requested = explicitId || envId;
  if (requested) {
    return {id: requested, reason: explicitId ? 'flag' : ENV_QUEST_ID};
  }
  const ids = questIds(root);
  const withPending = ids
    .filter((id) => fs.existsSync(pendingPath(root, id)))
    .sort((a, b) => mtimeMs(pendingPath(root, b)) - mtimeMs(pendingPath(root, a)));
  if (withPending.length > 0) {
    return {id: withPending[0], reason: 'pending-step'};
  }
  const open = ids
    .map((id) => {
      try {
        return questSummary(root, id);
      } catch (_error) {
        return null;
      }
    })
    .filter((entry) => entry && entry.state.questStatus === STATUS_OPEN)
    .sort((a, b) => {
      const priorityDelta = Number(a.quest.priority || 0) -
        Number(b.quest.priority || 0);
      if (priorityDelta !== 0) return priorityDelta;
      return mtimeMs(questPath(root, b.id)) - mtimeMs(questPath(root, a.id));
    });
  if (open.length > 0) {
    return {id: open[0].id, reason: 'open-priority'};
  }
  const newest = ids
    .sort((a, b) => mtimeMs(questPath(root, b)) - mtimeMs(questPath(root, a)));
  if (newest.length > 0) {
    return {id: newest[0], reason: 'newest-quest-file'};
  }
  return {id: null, reason: 'none'};
}

function gitStatus(root) {
  try {
    const out = execFileSync('git', ['status', '--short'], {
      cwd: root,
      encoding: DEFAULT_ENCODING,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch (_error) {
    return null;
  }
}

function formatProbe(probe) {
  const detail = probe.detail ? ` detail=${JSON.stringify(probe.detail)}` : EMPTY;
  return `metric=${probe.metric} done=${probe.done} evidence=${probe.evidence || '(none)'}${detail}`;
}

function buildContext(root, options = {}) {
  const selected = selectQuest(root, options.id);
  if (!selected.id) {
    return {
      selected,
      error: 'No Quest files found under solve/quests.',
      quests: [],
      worktree: gitStatus(root),
    };
  }
  const summary = questSummary(root, selected.id);
  const worktree = gitStatus(root);
  const unrecorded = detectUnrecordedEvidence(root, selected.id);
  return {
    selected,
    unrecorded,
    quest: {
      id: summary.id,
      statement: summary.quest.statement,
      priority: summary.quest.priority,
      doneWhen: summary.quest.doneWhen,
      status: summary.state.questStatus,
      evidence: summary.state.questEvidence,
      probe: summary.probe,
      health: summary.health,
      pending: summary.pending,
      frontiers: summary.state.frontiers,
      theories: summary.state.theories,
    },
    worktree,
  };
}

function renderFrontier(frontier) {
  const metric = `${frontier.baseline ?? '?'} -> ${frontier.current ?? '?'}`;
  return `- ${frontier.id}: ${frontier.status}, rung=${frontier.rungIndex}, ` +
    `attempts=${frontier.attempts}, metric=${metric}`;
}

function renderContext(context) {
  const lines = ['# Quest Context', EMPTY];
  if (context.error) {
    lines.push(context.error, EMPTY);
    lines.push('Create or select a Quest:', EMPTY);
    lines.push('- `node tooling/solve.js new --id <quest-id> --statement "<done condition>"`');
    return `${lines.join('\n')}\n`;
  }
  const quest = context.quest;
  if (context.unrecorded) {
    lines.push(
      'UNRECORDED_EVIDENCE: latest probe evidence is newer than Quest memory',
      EMPTY,
      'Show exact command:',
      EMPTY,
      `node tooling/solve.js ingest-evidence --id ${quest.id} --frontier ${context.unrecorded.frontier} --evidence ${context.unrecorded.evidence}`,
      EMPTY,
    );
  }
  lines.push('## Active Quest', EMPTY);
  lines.push(`- id: ${quest.id}`);
  lines.push(`- selected by: ${context.selected.reason}`);
  lines.push(`- status: ${quest.status}`);
  lines.push(`- goal: ${quest.statement}`);
  lines.push(`- doneWhen: ${quest.doneWhen.probe} ${JSON.stringify(quest.doneWhen.args || {})}`);
  lines.push(`- latest probe: ${formatProbe(quest.probe)}`);
  lines.push(EMPTY, '## Frontiers', EMPTY);
  for (const frontier of quest.frontiers) {
    lines.push(renderFrontier(frontier));
    for (const finding of frontier.findings || []) {
      lines.push(`  finding: ${finding.claim}`);
      if (finding.rulesOut) {
        lines.push(`  rulesOut: ${finding.rulesOut}`);
      }
    }
  }
  lines.push(EMPTY, '## Pending Step', EMPTY);
  if (quest.pending) {
    lines.push(`- frontier: ${quest.pending.frontier}`);
    lines.push(`- rungIndex: ${quest.pending.rungIndex}`);
    lines.push(`- before: ${formatProbe(quest.pending.before)}`);
  } else {
    lines.push('- none');
  }
  lines.push(EMPTY, '## Theory Health', EMPTY);
  lines.push(`- next action: ${quest.health.nextAction}`);
  if (quest.health.signals.length === 0) {
    lines.push('- signals: none');
  } else {
    for (const signal of quest.health.signals) {
      lines.push(`- signal: ${signal.type} severity=${signal.severity}`);
    }
  }
  if (quest.health.modelGuidance) {
    lines.push(EMPTY, '## Model Guidance', EMPTY);
    lines.push(`- command: ${quest.health.modelGuidance.command}`);
    lines.push(`- theory discriminator: ${quest.health.modelGuidance.discriminator}`);
    lines.push(`- modelRef: ${quest.health.modelGuidance.modelRef}`);
    lines.push(`- report pattern: ${quest.health.modelGuidance.reportPattern}`);
    lines.push(`- reasons: ${quest.health.modelGuidance.reasons.join(', ')}`);
    lines.push(`- instruction: ${quest.health.modelGuidance.instruction}`);
  }
  lines.push(EMPTY, '## Selected Theories', EMPTY);
  const selected = Object.entries(quest.theories?.selectedByFrontier || {});
  if (selected.length === 0) {
    lines.push('- none');
  } else {
    for (const [frontier, theory] of selected) {
      lines.push(`- ${frontier}: ${theory}`);
    }
  }
  lines.push(EMPTY, '## Useful Commands', EMPTY);
  lines.push(`- \`node tooling/solve.js status --id ${quest.id}\``);
  lines.push(`- \`node tooling/solve.js step --id ${quest.id}\``);
  lines.push(`- \`node tooling/solve.js step --id ${quest.id} --commit --changeRef diff:<path> --summary "<what changed>"\``);
  lines.push(`- \`node tooling/solve.js audit --id ${quest.id}\``);
  lines.push(`- \`node tooling/solve.js finding --id ${quest.id} --frontier <frontier> --claim "<claim>"\``);
  lines.push(`- \`node tooling/solve.js theory list --id ${quest.id}\``);
  lines.push(`- \`node tooling/solve.js health --id ${quest.id}\``);
  lines.push(`- \`node tooling/solve.js report --id ${quest.id}\``);
  if (quest.health.modelGuidance) {
    lines.push(`- \`${quest.health.modelGuidance.command}\``);
    lines.push(
      `- \`node tooling/solve.js step --id ${quest.id} --commit ` +
      '--changeRef diff:<path> --summary "<what changed>" --modelRef ' +
      `${quest.health.modelGuidance.modelRef}\``,
    );
  }
  lines.push(EMPTY, '## Source Change Verification', EMPTY);
  lines.push('- required for every Quest-scoped source code change before audit and git handoff');
  lines.push('- spawn a subagent to review the final source diff for Quest intent, system guidelines, and doctrine');
  lines.push('- record the review as a Solver finding with evidence `subagent:<id>`');
  lines.push(
    `- \`node tooling/solve.js finding --id ${quest.id} ` +
    '--frontier <frontier> --claim "Subagent verifier approved source changes" ' +
    '--evidence subagent:<id>`',
  );
  lines.push(EMPTY, '## Git Handoff', EMPTY);
  lines.push('- required after `node tooling/solve.js audit --id <quest>` passes');
  lines.push(
    '- commit all Quest-scoped source, test, docs, steering, Quest log, ' +
    'Quest report, and `solve/changes/` artifacts',
  );
  lines.push('- do not include unrelated dirty worktree entries from other Quests');
  lines.push('- `git status --short`');
  lines.push('- `git add <quest-scoped paths>`');
  lines.push(`- \`git commit -m "${quest.id}: <summary>"\``);
  lines.push('- `git push`');
  lines.push(EMPTY, '## Worktree Summary', EMPTY);
  if (context.worktree === null) {
    lines.push('- git status unavailable');
  } else if (context.worktree.length === 0) {
    lines.push('- clean');
  } else {
    lines.push(`- dirty entries: ${context.worktree.length}`);
    for (const entry of context.worktree.slice(0, MAX_WORKTREE_LINES)) {
      lines.push(`- \`${entry}\``);
    }
    if (context.worktree.length > MAX_WORKTREE_LINES) {
      lines.push(`- ... ${context.worktree.length - MAX_WORKTREE_LINES} more`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main(argv = process.argv, root = process.cwd()) {
  const args = parseArgs(argv.slice(2));
  const context = buildContext(root, args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(context, null, 2)}\n`);
  } else {
    process.stdout.write(renderContext(context));
  }
  return context.error ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}

export {
  buildContext,
  renderContext,
  selectQuest,
};
