// Portfolio projection — the cross-quest governance surface.
//
// Individual reports answer "what happened in THIS quest?". The portfolio answers
// the governance question the per-quest view cannot: "what is the shape of the
// whole body of work?". Specifically it surfaces the meta-to-product ratio —
// how much of the effort is scaffolding the solver/process itself (class
// "process") versus solving real product problems (class "product"). A healthy
// portfolio keeps product quests as the majority of open work; this view makes
// that ratio observable instead of implicit.
//
// Like every other read surface this is a pure projection of the append-only
// logs plus the sealed quest files. It asserts nothing the logs do not contain
// and can be regenerated at any time.

import fs from 'node:fs';
import path from 'node:path';

import {
  SOLVE_DATA_DIR,
  QUESTS_SUBDIR,
  EVENT_QUEST,
  EVENT_ATTEMPT,
  STATUS_SOLVED,
  STATUS_EXHAUSTED,
  STATUS_OPEN,
  QUEST_CLASS_PRODUCT,
  QUEST_CLASS_PROCESS,
} from './constants.js';
import {loadQuest, readLog} from './store.js';
import {questClass, closureKind} from './closure-kind.js';

function listQuestIds(root) {
  const dir = path.join(root, SOLVE_DATA_DIR, QUESTS_SUBDIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

// Terminal outcome is read straight from the last quest event in the log; an
// absent quest event means the quest is still open (no terminal recorded).
function terminalOutcome(log) {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i].type === EVENT_QUEST) return log[i].status;
  }
  return STATUS_OPEN;
}

export function questPortfolioRow(quest, log) {
  const outcome = terminalOutcome(log);
  return {
    id: quest.id,
    class: questClass(quest),
    closure: closureKind(quest, log),
    outcome,
    solved: outcome === STATUS_SOLVED,
    open: outcome === STATUS_OPEN,
    attempts: log.filter((e) => e.type === EVENT_ATTEMPT).length,
  };
}

function emptyClassTally() {
  return {total: 0, solved: 0, exhausted: 0, open: 0};
}

export function summarizePortfolio(rows) {
  const byClass = {
    [QUEST_CLASS_PRODUCT]: emptyClassTally(),
    [QUEST_CLASS_PROCESS]: emptyClassTally(),
  };
  for (const row of rows) {
    const tally = byClass[row.class];
    tally.total += 1;
    if (row.outcome === STATUS_SOLVED) tally.solved += 1;
    else if (row.outcome === STATUS_EXHAUSTED) tally.exhausted += 1;
    else if (row.outcome === STATUS_OPEN) tally.open += 1;
  }
  const product = byClass[QUEST_CLASS_PRODUCT];
  const process = byClass[QUEST_CLASS_PROCESS];
  // The governance signal is the open-work mix: scaffolding should not silently
  // dominate the open frontier. Ratio is process-open per product-open.
  const ratio = product.open === 0 ?
    (process.open === 0 ? 0 : Infinity) :
    process.open / product.open;
  return {byClass, total: rows.length, openRatioProcessPerProduct: ratio};
}

export function buildPortfolio(root) {
  const rows = listQuestIds(root).map((id) => {
    const quest = loadQuest(root, id);
    return questPortfolioRow(quest, readLog(root, id));
  });
  return {rows, summary: summarizePortfolio(rows)};
}

function ratioText(ratio) {
  if (ratio === Infinity) return '∞ (process-only open work)';
  return ratio.toFixed(2);
}

export function renderPortfolio(portfolio) {
  const {rows, summary} = portfolio;
  const lines = ['# Quest portfolio', ''];
  if (rows.length === 0) {
    lines.push('_(no quests found)_', '');
    return lines.join('\n');
  }
  lines.push('| id | class | closure | outcome | attempts |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${row.class} | ${row.closure} | ${row.outcome} | ${row.attempts} |`,
    );
  }
  const product = summary.byClass[QUEST_CLASS_PRODUCT];
  const process = summary.byClass[QUEST_CLASS_PROCESS];
  lines.push('', '## Summary');
  lines.push(
    `- product: ${product.total} (solved ${product.solved}, ` +
    `exhausted ${product.exhausted}, open ${product.open})`,
  );
  lines.push(
    `- process: ${process.total} (solved ${process.solved}, ` +
    `exhausted ${process.exhausted}, open ${process.open})`,
  );
  lines.push(
    `- open process:product ratio: ${ratioText(summary.openRatioProcessPerProduct)}`,
  );
  lines.push('');
  return lines.join('\n');
}

export function runPortfolioCommand(root) {
  return renderPortfolio(buildPortfolio(root));
}
