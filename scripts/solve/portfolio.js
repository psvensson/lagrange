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
  EVENT_ATTEMPT,
  STATUS_SOLVED,
  STATUS_EXHAUSTED,
  STATUS_OPEN,
  STATUS_PARKED,
  PARK_KIND_CANNOT_MEASURE,
  QUEST_CLASS_PRODUCT,
  QUEST_CLASS_PROCESS,
} from './constants.js';
import {loadQuest, readLog, projectState} from './store.js';
import {questClass, closureKind} from './closure-kind.js';

export function listQuestIds(root) {
  const dir = path.join(root, SOLVE_DATA_DIR, QUESTS_SUBDIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

// Load every sealed quest file (id-sorted). The shared loader for any cross-quest
// surface that needs the quest objects themselves (e.g. their `links` block), not
// just the log-derived portfolio rows.
export function loadAllQuests(root) {
  return listQuestIds(root).map((id) => loadQuest(root, id));
}

export function questPortfolioRow(quest, log) {
  const state = projectState(quest, log);
  const outcome = state.questStatus;
  const reopens = state.frontiers.reduce((sum, f) => sum + (f.reopenCount || 0), 0);
  // Auto-reopens are the SOLVED->fresh-failure flap (distinct from deliberate `reopen`
  // CLI revivals): they climb toward OSCILLATION_REOPEN_BUDGET and then terminate the
  // quest EXHAUSTED, so they are surfaced separately as a stuck-work signal.
  const autoReopens = state.frontiers.reduce((sum, f) => sum + (f.autoReopenCount || 0), 0);
  const cannotMeasure = state.frontiers.filter(
    (f) => f.status === STATUS_PARKED && f.parkKind === PARK_KIND_CANNOT_MEASURE).length;
  return {
    id: quest.id,
    class: questClass(quest),
    closure: closureKind(quest, log),
    outcome,
    solved: outcome === STATUS_SOLVED,
    open: outcome === STATUS_OPEN,
    attempts: log.filter((e) => e.type === EVENT_ATTEMPT).length,
    reopens,
    autoReopens,
    cannotMeasure,
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
  lines.push('| id | class | closure | outcome | attempts | reopens | cannot-measure |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${row.class} | ${row.closure} | ${row.outcome} | ` +
      `${row.attempts} | ${row.reopens} | ${row.cannotMeasure} |`,
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
