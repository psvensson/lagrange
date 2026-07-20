import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent} from '../../scripts/solve/store.js';
import {
  buildPortfolio,
  OPEN_PRODUCT_QUEST_WIP_CAP,
  summarizePortfolio,
  renderPortfolio,
  questPortfolioRow,
} from '../../scripts/solve/portfolio.js';
import {readLog} from '../../scripts/solve/store.js';
import {
  EVENT_ATTEMPT,
  EVENT_EVIDENCE_INGESTED,
  EVENT_FINDING,
  EVENT_QUEST,
  EVENT_QUEST_DECLARED,
  STATUS_OPEN,
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

function declareQuest(root, quest) {
  appendEvent(root, quest.id, {
    type: EVENT_QUEST_DECLARED,
    sealed: {
      doneWhen: quest.doneWhen,
      frontierMetrics: quest.frontiers.map((frontier) => frontier.metric),
    },
  });
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
    const prodOpenQuest = measuredQuest('prod-open');
    saveQuest(root, prodOpenQuest);
    declareQuest(root, prodOpenQuest);
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
    t.equal(summary.byClass.product.draft, 0, 'no product drafts');
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

  t.test('undeclared projected-open quests are drafts, not active open work', (t) => {
    const root = tmp();
    const draft = measuredQuest('prod-draft');
    saveQuest(root, draft);

    const row = questPortfolioRow(draft, readLog(root, draft.id));
    t.equal(row.outcome, STATUS_OPEN, 'store-level outcome remains backward-compatible');
    t.equal(row.stage, 'draft', 'portfolio assigns the local draft stage');
    t.ok(row.draft, 'row is explicitly draft');
    t.notOk(row.open, 'draft is excluded from active open-work consumers');

    const summary = summarizePortfolio([row]);
    t.equal(summary.byClass.product.draft, 1, 'draft is tallied separately');
    t.equal(summary.byClass.product.open, 0, 'draft is excluded from the open tally');
    t.equal(summary.openRatioProcessPerProduct, 0, 'draft does not distort the open ratio');
    const md = renderPortfolio({rows: [row], summary});
    t.match(md, /\| prod-draft \| product \| MEASURED \| draft \| open \|/u,
      'render exposes stage separately from the store outcome');

    fs.rmSync(root, {recursive: true, force: true});
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

  t.test('bound verifier rejection after SOLVED projects the Quest as open', (t) => {
    const root = tmp();
    const quest = measuredQuest('rejected-terminal');
    const sha256 = 'a'.repeat(64);
    saveQuest(root, quest);
    declareQuest(root, quest);
    appendEvent(root, quest.id, {
      type: EVENT_ATTEMPT,
      frontier: 'rejected-terminal-main',
      rung: 'local-fix',
      metricBefore: 1,
      metricAfter: 0,
      verificationContractVersion: 1,
      changeRefIdentity: {sha256},
    });
    appendEvent(root, quest.id, {
      type: EVENT_QUEST,
      status: STATUS_SOLVED,
      evidence: 'passing-report.json',
    });
    appendEvent(root, quest.id, {
      type: EVENT_FINDING,
      frontier: 'rejected-terminal-main',
      kind: 'verifier-rejection',
      claim: 'independent verification rejected this exact attempt',
      evidence: 'subagent:portfolio-rejection-fixture',
      verification: {
        schemaVersion: 1,
        scope: 'attempt',
        fingerprint: `sha256:${sha256}`,
        verdict: 'rejected',
      },
    });

    const row = questPortfolioRow(quest, readLog(root, quest.id));
    t.equal(row.outcome, STATUS_OPEN, 'current projected outcome is open');
    t.ok(row.open, 'open-work consumers include the rejected Quest');
    t.notOk(row.solved, 'the superseded terminal event is not presented as current');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('fresh failed doneWhen evidence after SOLVED projects the Quest as open', (t) => {
    const root = tmp();
    const quest = measuredQuest('fresh-failure');
    saveQuest(root, quest);
    declareQuest(root, quest);
    appendEvent(root, quest.id, {
      type: EVENT_QUEST,
      status: STATUS_SOLVED,
      evidence: 'passing-report.json',
    });
    appendEvent(root, quest.id, {
      type: EVENT_EVIDENCE_INGESTED,
      frontier: 'fresh-failure-main',
      probeScope: 'doneWhen',
      invalidSample: false,
      done: false,
      evidence: 'fresh-failing-report.json',
    });

    const row = questPortfolioRow(quest, readLog(root, quest.id));
    t.equal(row.outcome, STATUS_OPEN, 'fresh closure failure reopens the portfolio row');
    t.ok(row.open, 'open-work consumers include the fresh failure');
    t.notOk(row.solved, 'the older terminal event is not presented as current');
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

// The WIP advisory fires only when open PRODUCT quests exceed the cap: most
// product quests close through one serialized live gate, so overrun is
// attribution overhead, not parallelism. Advisory, never blocking.
tap.test('open-product WIP cap advisory', async (t) => {
  function openProductRows(count) {
    return Array.from({length: count}, (_unused, index) => ({
      id: `p-${index}`, class: 'product', closure: 'MEASURED',
      outcome: 'open', open: true,
    }));
  }

  t.test('under the cap stays quiet', (t) => {
    const rows = openProductRows(3);
    const summary = summarizePortfolio(rows);
    t.equal(summary.openProductOverCap, 0);
    t.notMatch(renderPortfolio({rows, summary}), /WIP advisory/u);
    t.end();
  });

  t.test('over the cap surfaces the sweep advisory', (t) => {
    const rows = openProductRows(OPEN_PRODUCT_QUEST_WIP_CAP + 4);
    const summary = summarizePortfolio(rows);
    t.equal(summary.openProductOverCap, 4);
    const md = renderPortfolio({rows, summary});
    t.match(md, /WIP advisory/u);
    t.match(md, /operator-park any open quest whose\nresidual is already delegated|operator-park any open quest/u,
      'the advisory names the sweep action');
    t.end();
  });

  t.end();
});
