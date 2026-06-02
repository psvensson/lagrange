import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent} from '../../scripts/solve/store.js';
import {
  buildPortfolio,
  summarizePortfolio,
  renderPortfolio,
  questPortfolioRow,
} from '../../scripts/solve/portfolio.js';
import {readLog} from '../../scripts/solve/store.js';
import {
  EVENT_ATTEMPT,
  EVENT_QUEST,
  STATUS_SOLVED,
  STATUS_EXHAUSTED,
} from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-'));
}

function measuredQuest(id) {
  return {
    id,
    statement: `${id} statement`,
    priority: 1,
    class: 'product',
    doneWhen: {probe: 'scenario-harness', args: {scenario: id, consecutive: 3}},
    frontiers: [{id: `${id}-main`, priority: 1,
      metric: {probe: 'scenario-harness', args: {scenario: id}}}],
  };
}

function oracleProcessQuest(id) {
  return {
    id,
    statement: `${id} statement`,
    priority: 1,
    class: 'process',
    doneWhen: {probe: 'oracle', args: {file: 'x'}},
    frontiers: [{id: `${id}-main`, priority: 1,
      metric: {probe: 'oracle', args: {file: 'x'}}}],
  };
}

tap.test('portfolio projection (Concern 3)', async (t) => {
  t.test('aggregates class, closure and outcome across quests', (t) => {
    const root = tmp();
    // One solved measured product quest.
    saveQuest(root, measuredQuest('prod-solved'));
    appendEvent(root, 'prod-solved', {
      type: EVENT_ATTEMPT, frontier: 'prod-solved-main', rung: 'local-fix',
      metricBefore: 3, metricAfter: 0,
    });
    appendEvent(root, 'prod-solved', {type: EVENT_QUEST, status: STATUS_SOLVED, evidence: 'r.json'});
    // One still-open measured product quest.
    saveQuest(root, measuredQuest('prod-open'));
    appendEvent(root, 'prod-open', {
      type: EVENT_ATTEMPT, frontier: 'prod-open-main', rung: 'local-fix',
      metricBefore: 5, metricAfter: 4,
    });
    // One solved oracle process quest.
    saveQuest(root, oracleProcessQuest('proc-solved'));
    appendEvent(root, 'proc-solved', {type: EVENT_QUEST, status: STATUS_SOLVED, evidence: 'o.json'});

    const {rows, summary} = buildPortfolio(root);
    t.equal(rows.length, 3, 'three quests scanned');

    const prodSolved = rows.find((r) => r.id === 'prod-solved');
    t.equal(prodSolved.class, 'product');
    t.equal(prodSolved.closure, 'MEASURED');
    t.equal(prodSolved.outcome, STATUS_SOLVED);
    t.equal(prodSolved.attempts, 1);

    const procSolved = rows.find((r) => r.id === 'proc-solved');
    t.equal(procSolved.class, 'process');
    t.equal(procSolved.closure, 'DECISION');

    t.equal(summary.byClass.product.total, 2, 'two product quests');
    t.equal(summary.byClass.product.solved, 1, 'one product solved');
    t.equal(summary.byClass.product.open, 1, 'one product open');
    t.equal(summary.byClass.process.total, 1, 'one process quest');
    t.equal(summary.byClass.process.solved, 1, 'one process solved');
    t.equal(summary.byClass.process.open, 0, 'no process open');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('open ratio is process-open per product-open', (t) => {
    const rows = [
      {id: 'a', class: 'product', closure: 'MEASURED', outcome: 'open', open: true},
      {id: 'b', class: 'process', closure: 'DECISION', outcome: 'open', open: true},
      {id: 'c', class: 'process', closure: 'DECISION', outcome: 'open', open: true},
    ];
    const summary = summarizePortfolio(rows);
    t.equal(summary.openRatioProcessPerProduct, 2, 'two open process per one open product');
    t.end();
  });

  t.test('process-only open work yields an infinite ratio', (t) => {
    const rows = [
      {id: 'b', class: 'process', closure: 'DECISION', outcome: 'open', open: true},
    ];
    const summary = summarizePortfolio(rows);
    t.equal(summary.openRatioProcessPerProduct, Infinity, 'no product open work');
    const md = renderPortfolio({rows, summary});
    t.match(md, /process-only open work/, 'render labels the infinite case');
    t.end();
  });

  t.test('exhausted terminal is tallied distinctly from solved and open', (t) => {
    const root = tmp();
    saveQuest(root, measuredQuest('prod-exhausted'));
    appendEvent(root, 'prod-exhausted', {
      type: EVENT_QUEST, status: STATUS_EXHAUSTED, evidence: null,
    });
    const quest = measuredQuest('prod-exhausted');
    const row = questPortfolioRow(quest, readLog(root, 'prod-exhausted'));
    t.equal(row.outcome, STATUS_EXHAUSTED);
    t.notOk(row.solved, 'exhausted is not solved');
    t.notOk(row.open, 'exhausted is not open');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('empty repo renders a no-quests portfolio', (t) => {
    const root = tmp();
    const md = renderPortfolio(buildPortfolio(root));
    t.match(md, /no quests found/, 'handles an empty portfolio');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
