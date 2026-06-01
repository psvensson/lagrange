import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {runLoop} from '../../scripts/solve/loop.js';
import {projectState} from '../../scripts/solve/store.js';
import {readLog} from '../../scripts/solve/store.js';
import {makeDryExecutor} from '../../scripts/solve/executor.js';
import {
  STATUS_SOLVED, STATUS_PARKED, STATUS_EXHAUSTED, OUTCOME_MAX_CYCLES,
} from '../../scripts/solve/constants.js';

function setup({metric, target = 0, frontiers = ['f1']}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-'));
  const oracleDir = path.join(root, 'oracle');
  fs.mkdirSync(oracleDir, {recursive: true});
  const quest = {
    id: 'g1',
    statement: 'shrink the metric to target',
    priority: 100,
    doneWhen: null,
    frontiers: [],
  };
  // Each frontier gets its own oracle file; the quest is done when the *last* frontier
  // hits target (single-frontier quests: that frontier's oracle is the quest oracle).
  let lastFile = null;
  frontiers.forEach((id, i) => {
    const file = path.join(oracleDir, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify({metric, target}));
    quest.frontiers.push({
      id, priority: frontiers.length - i,
      metric: {probe: 'oracle', args: {file}},
    });
    lastFile = file;
  });
  quest.doneWhen = {probe: 'oracle', args: {file: lastFile}};
  return {root, quest, changeDir: path.join(root, 'changes')};
}

tap.test('solver loop — P0 walking skeleton', async (t) => {
  t.test('SOLVED terminal on a shrinking oracle', (t) => {
    const {root, quest, changeDir} = setup({metric: 3, target: 0});
    const res = runLoop(root, quest, {
      executor: makeDryExecutor({step: 1, changeDir}),
      maxCycles: 50,
    });
    t.equal(res.outcome, STATUS_SOLVED, 'quest solved');
    t.equal(res.state.frontiers[0].status, STATUS_SOLVED, 'frontier solved');
    t.equal(res.state.frontiers[0].current, 0, 'metric reached target');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('EXHAUSTED terminal when the only frontier stalls and parks', (t) => {
    const {root, quest, changeDir} = setup({metric: 5, target: 0});
    const res = runLoop(root, quest, {
      executor: makeDryExecutor({changeDir, stallFrontiers: ['f1']}),
      maxCycles: 50,
    });
    t.equal(res.outcome, STATUS_EXHAUSTED, 'run exhausted, not hung');
    t.equal(res.state.frontiers[0].status, STATUS_PARKED, 'frontier parked');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('climbs the ladder on consecutive stalls', (t) => {
    const {root, quest, changeDir} = setup({metric: 5, target: 0});
    runLoop(root, quest, {
      executor: makeDryExecutor({changeDir, stallFrontiers: ['f1']}),
      maxCycles: 2,
    });
    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.frontiers[0].rungIndex, 2, 'two stalls => rung climbed to 2');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('keeps the rung while making progress', (t) => {
    const {root, quest, changeDir} = setup({metric: 4, target: 0});
    runLoop(root, quest, {
      executor: makeDryExecutor({step: 1, changeDir}),
      maxCycles: 2,
    });
    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.frontiers[0].rungIndex, 0, 'progress keeps rung at local-fix');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('scheduler redirects: stalled frontier parks, other solves quest', (t) => {
    const {root, quest, changeDir} = setup({metric: 3, target: 0,
      frontiers: ['stuck', 'movable']});
    // 'stuck' has higher priority (declared first) but never moves; the loop must
    // park it and still reach SOLVED via 'movable' (whose oracle is the quest oracle).
    const res = runLoop(root, quest, {
      executor: makeDryExecutor({step: 1, changeDir, stallFrontiers: ['stuck']}),
      maxCycles: 100,
    });
    t.equal(res.outcome, STATUS_SOLVED, 'quest solved despite a stuck frontier');
    const stuck = res.state.frontiers.find((f) => f.id === 'stuck');
    t.equal(stuck.status, STATUS_PARKED, 'stuck frontier parked');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('MAX_CYCLES is a bounded stop, not a terminal', (t) => {
    const {root, quest, changeDir} = setup({metric: 100, target: 0});
    const res = runLoop(root, quest, {
      executor: makeDryExecutor({step: 1, changeDir}),
      maxCycles: 1,
    });
    t.equal(res.outcome, OUTCOME_MAX_CYCLES, 'stops at the cycle bound');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
