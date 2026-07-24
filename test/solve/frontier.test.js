import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent} from '../../scripts/solve/store.js';
import {
  buildFrontier,
  renderFrontier,
  STALE_OPEN_QUEST_DAYS,
} from '../../scripts/solve/frontier.js';
import {EVENT_QUEST_DECLARED} from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-'));
}

function quest(id) {
  return {
    id,
    statement: `${id} statement`,
    priority: 1,
    class: 'product',
    links: {},
    doneWhen: {probe: 'scenario-harness', args: {scenario: id, consecutive: 3}},
    frontiers: [{id: `${id}-main`, priority: 1,
      metric: {probe: 'scenario-harness', args: {scenario: id}}}],
  };
}

function declareQuestAt(root, value, ts) {
  saveQuest(root, value);
  appendEvent(root, value.id, {
    ts,
    type: EVENT_QUEST_DECLARED,
    sealed: {
      doneWhen: value.doneWhen,
      frontierMetrics: value.frontiers.map((frontier) => frontier.metric),
    },
  });
}

tap.test('frontier open-quest staleness', async (t) => {
  t.test('flags quests whose last event trails the newest by over the budget', (t) => {
    const root = tmp();
    declareQuestAt(root, quest('q-fresh'), '2026-07-24T09:00:00.000Z');
    declareQuestAt(root, quest('q-stale'), '2026-07-10T09:00:00.000Z');

    const md = renderFrontier(buildFrontier(root));
    t.match(md, /\| q-fresh \| product \| 0 \| 0 \| 2026-07-24 \|/u,
      'fresh quest shows its last-event date without a flag');
    t.match(md, /\| q-stale \| product \| 0 \| 0 \| 2026-07-10 ⚠ stale \|/u,
      'trailing quest is flagged stale');
    const note = '1 open quest\\(s\\) are ⚠ stale \\(last event more than ' +
      `${STALE_OPEN_QUEST_DAYS} days behind`;
    t.match(md, new RegExp(note, 'u'),
      'stale worklist note names the count and the budget');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('does not flag quests within the budget and never flags the newest', (t) => {
    const root = tmp();
    declareQuestAt(root, quest('q-newest'), '2026-07-24T09:00:00.000Z');
    declareQuestAt(root, quest('q-recent'), '2026-07-19T09:00:00.000Z');

    const md = renderFrontier(buildFrontier(root));
    t.notMatch(md, /⚠ stale/u, 'no quest within the budget is flagged');
    t.notMatch(md, /open quest\(s\) are ⚠ stale/u, 'no worklist note without stale quests');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a lone open quest is its own anchor and never stale', (t) => {
    const root = tmp();
    declareQuestAt(root, quest('q-lonely'), '2026-01-01T00:00:00.000Z');

    const md = renderFrontier(buildFrontier(root));
    t.match(md, /\| q-lonely \| product \| 0 \| 0 \| 2026-01-01 \|/u,
      'lone quest renders its date unflagged');
    t.notMatch(md, /⚠ stale/u, 'staleness is relative, not wall-clock');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('board is a pure projection: repeated renders are byte-identical', (t) => {
    const root = tmp();
    declareQuestAt(root, quest('q-fresh'), '2026-07-24T09:00:00.000Z');
    declareQuestAt(root, quest('q-stale'), '2026-07-01T09:00:00.000Z');

    const first = renderFrontier(buildFrontier(root));
    const second = renderFrontier(buildFrontier(root));
    t.equal(first, second, 'no wall-clock time leaks into the board');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
