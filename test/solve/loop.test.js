import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

import {runLoop} from '../../scripts/solve/loop.js';
import {appendEvent, projectState, readLog, saveQuest} from '../../scripts/solve/store.js';
import {makeDryExecutor} from '../../scripts/solve/executor.js';
import {
  EVENT_ATTEMPT,
  EVENT_PARK,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_SELECTED,
  EVENT_VIOLATION,
  STATUS_SOLVED,
  STATUS_PARKED,
  STATUS_EXHAUSTED,
  THEORY_RESULT_ACTIVE,
  OUTCOME_MAX_CYCLES,
  OUTCOME_THEORY_REQUIRED,
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
  return {root, quest, changeDir: path.join(root, 'solve', 'changes', quest.id)};
}

function recordFrontierTheory(root, quest, frontier = 'f1', theory = 'theory-f1') {
  appendEvent(root, quest.id, {
    type: EVENT_THEORY_OPTION_DECLARED,
    theory,
    frontier,
    status: THEORY_RESULT_ACTIVE,
    layer: 'observation',
    mechanism: 'observation_gap',
    intervention: 'capture fresh evidence',
    expectedMovement: 'metric decreases',
    negativeResultMeans: 'same metric falsifies this path',
    discriminator: 'oracle',
    promotionRule: 'metric decreases',
    rejectionRule: 'metric stays flat',
  });
  appendEvent(root, quest.id, {
    type: EVENT_THEORY_SELECTED,
    frontier,
    theory,
  });
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

  t.test('EXHAUSTED terminal when the only frontier is parked', (t) => {
    const {root, quest, changeDir} = setup({metric: 5, target: 0});
    appendEvent(root, quest.id, {
      type: EVENT_PARK,
      frontier: 'f1',
      reason: 'already exhausted',
      finalMetric: 5,
    });
    const res = runLoop(root, quest, {
      executor: makeDryExecutor({changeDir, stallFrontiers: ['f1']}),
      maxCycles: 50,
    });
    t.equal(res.outcome, STATUS_EXHAUSTED, 'run exhausted, not hung');
    t.equal(res.state.frontiers[0].status, STATUS_PARKED, 'frontier parked');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('climbs to model rung on consecutive stalls when theory is selected', (t) => {
    const {root, quest, changeDir} = setup({metric: 5, target: 0});
    runLoop(root, quest, {
      executor: makeDryExecutor({changeDir, stallFrontiers: ['f1']}),
      maxCycles: 1,
    });
    recordFrontierTheory(root, quest);
    runLoop(root, quest, {
      executor: makeDryExecutor({changeDir, stallFrontiers: ['f1']}),
      maxCycles: 1,
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

  t.test('scheduler redirects: parked frontier is skipped while other solves quest', (t) => {
    const {root, quest, changeDir} = setup({metric: 3, target: 0,
      frontiers: ['stuck', 'movable']});
    appendEvent(root, quest.id, {
      type: EVENT_PARK,
      frontier: 'stuck',
      reason: 'already exhausted',
      finalMetric: 3,
    });
    // 'stuck' has higher priority (declared first) but is already parked; the loop
    // must skip it and still reach SOLVED via 'movable' (the quest oracle).
    const res = runLoop(root, quest, {
      executor: makeDryExecutor({step: 1, changeDir}),
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

  t.test('autonomous loop stops before executor when theory gate is unmet', (t) => {
    const {root, quest, changeDir} = setup({metric: 5, target: 0});
    runLoop(root, quest, {
      executor: makeDryExecutor({changeDir, stallFrontiers: ['f1']}),
      maxCycles: 1,
    });

    let executorCalls = 0;
    const res = runLoop(root, quest, {
      executor: {
        run() {
          executorCalls += 1;
          return {changeRef: null, summary: 'should not run'};
        },
      },
      maxCycles: 1,
    });
    const log = readLog(root, quest.id);
    const attempts = log.filter((event) => event.type === EVENT_ATTEMPT);
    const violations = log.filter((event) => event.type === EVENT_VIOLATION);
    t.equal(res.outcome, OUTCOME_THEORY_REQUIRED, 'stops at the theory gate');
    t.equal(executorCalls, 0, 'executor was not invoked');
    t.equal(attempts.length, 1, 'no extra attempt was recorded past the gate');
    t.equal(violations[violations.length - 1].scope, 'theory-gate');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

// R1: the autonomous loop persists each measured attempt as its own scope-clean
// commit instead of stacking attempts in one dirty tree.
tap.test('R1 per-attempt auto-commit on the loop path', async (t) => {
  function initGit(root) {
    const run = (...args) => execFileSync('git', args, {cwd: root, stdio: 'ignore'});
    run('init');
    run('config', 'user.email', 'solver@example.com');
    run('config', 'user.name', 'Solver');
    run('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(root, '.gitkeep'), '');
    run('add', '-A');
    run('commit', '-m', 'init');
  }

  // A doc-path change artifact so the honesty source-change-verification gate does not
  // demand a subagent finding; the loop can then auto-commit each measured attempt.
  function docExecutor(changeDir) {
    return {
      name: 'doc',
      run(task) {
        fs.mkdirSync(changeDir, {recursive: true});
        const file = `${changeDir}/${task.frontierDef.id}-${Date.now()}-${Math.random()}.diff`;
        fs.writeFileSync(file, [
          'diff --git a/docs/note.md b/docs/note.md',
          '--- a/docs/note.md',
          '+++ b/docs/note.md',
          '@@ -1 +1 @@',
          '-before',
          '+after',
        ].join('\n'));
        const oracleFile = task.frontierDef.metric?.args?.file;
        const data = JSON.parse(fs.readFileSync(oracleFile, 'utf8'));
        data.metric = Math.max(0, data.metric - 1);
        fs.writeFileSync(oracleFile, JSON.stringify(data));
        return {changeRef: `diff:${file}`, summary: 'doc step -1'};
      },
    };
  }

  function commitCount(root) {
    return execFileSync('git', ['rev-list', '--count', 'HEAD'],
      {cwd: root, encoding: 'utf8'}).trim();
  }

  t.test('each measured attempt produces a commit, push suppressed', (t) => {
    const {root, quest, changeDir} = setup({metric: 2, target: 0});
    saveQuest(root, quest);
    initGit(root);
    const before = Number(commitCount(root));
    const res = runLoop(root, quest, {
      executor: docExecutor(changeDir),
      push: false,
      maxCycles: 50,
    });
    t.equal(res.outcome, STATUS_SOLVED, 'quest solved');
    const after = Number(commitCount(root));
    t.ok(after - before >= 2, 'at least one commit per measured attempt');
    const msg = execFileSync('git', ['log', '-1', '--format=%B'],
      {cwd: root, encoding: 'utf8'});
    t.match(msg, /Co-authored-by: Copilot/, 'commits carry the co-author trailer');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('autoCommit:false leaves the loop committing only at the terminal flush', (t) => {
    const {root, quest, changeDir} = setup({metric: 2, target: 0});
    saveQuest(root, quest);
    initGit(root);
    const before = Number(commitCount(root));
    runLoop(root, quest, {
      executor: docExecutor(changeDir),
      autoCommit: false,
      push: false,
      maxCycles: 50,
    });
    const after = Number(commitCount(root));
    t.equal(after - before, 1, 'only the single terminal commit is made');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
