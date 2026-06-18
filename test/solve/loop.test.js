import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

import {
  runLoop,
  runSupervised,
  durableProgressCount,
  finalizeAttempt,
  makeRunContext,
} from '../../scripts/solve/loop.js';
import {appendEvent, projectState, readLog, saveQuest} from '../../scripts/solve/store.js';
import {CONTINUATION_BLOCKED_THEORY} from '../../scripts/solve/continuation.js';
import {makeDryExecutor} from '../../scripts/solve/executor.js';
import {registerProbe} from '../../scripts/solve/probe.js';
import {ingestEvidence} from '../../scripts/solve/evidence.js';
import {
  EVENT_ATTEMPT,
  EVENT_PARK,
  EVENT_FINDING,
  EVENT_GATE_DECISION,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_SELECTED,
  DISPOSITION_ADVISORY,
  STATUS_SOLVED,
  STATUS_PARKED,
  STATUS_EXHAUSTED,
  PARK_KIND_CANNOT_MEASURE,
  CANNOT_MEASURE_RETRY_BUDGET,
  THEORY_RESULT_ACTIVE,
  OUTCOME_MAX_CYCLES,
  OUTCOME_THEORY_REQUIRED,
  EVENT_REFLECTION,
  REFLECTION_INTERVAL,
  EVENT_THEORY_RESULT,
  EVENT_FRONTIER_REOPENED,
  EVENT_EVIDENCE_INGESTED,
  DISPOSITION_PARK_RESUMABLE,
  DISPOSITION_EXPLORE,
  OUTCOME_BLOCKED,
  OUTCOME_SUPERVISOR_PAUSED_MEASUREMENT,
  OUTCOME_SUPERVISOR_STALLED,
  OUTCOME_SUPERVISOR_BUDGET,
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

  t.test('climbs the ladder on consecutive stalls when theory is selected', (t) => {
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
    t.equal(state.frontiers[0].rungIndex, 2, 'two stalls => rung climbed to 2 (widen-scope)');
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
    t.equal(state.frontiers[0].rungIndex, 0, 'progress keeps rung at observe');
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

  t.test('autonomous loop takes a soft-first exploratory attempt instead of stopping on ' +
    'the first theory gate', (t) => {
    const {root, quest, changeDir} = setup({metric: 5, target: 0});
    // Two stalls climb observe(0) -> local-fix(1) -> widen-scope(2), where a frontier
    // theory becomes required but none is recorded — a soft-eligible theory gate.
    runLoop(root, quest, {
      executor: makeDryExecutor({changeDir, stallFrontiers: ['f1']}),
      maxCycles: 2,
    });

    const inner = makeDryExecutor({changeDir, stallFrontiers: ['f1']});
    let executorCalls = 0;
    const res = runLoop(root, quest, {
      executor: {
        run(task) {
          executorCalls += 1;
          return inner.run(task);
        },
      },
      maxCycles: 1,
    });
    const log = readLog(root, quest.id);
    const advisories = log.filter((event) =>
      event.type === EVENT_GATE_DECISION &&
      event.disposition === DISPOSITION_ADVISORY &&
      event.code === CONTINUATION_BLOCKED_THEORY);
    // Soft-first: the missing theory does NOT stop the run on sight. The loop records one
    // advisory and makes a real (executor-backed) attempt this cycle instead.
    t.not(res.outcome, OUTCOME_THEORY_REQUIRED, 'soft-first does not hard-stop on first gate');
    t.equal(executorCalls, 1, 'executor was invoked under the soft-first advisory');
    t.equal(advisories.length, 1, 'exactly one advisory recorded for the cycle (no double-count)');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('autonomous loop takes a soft-first exploratory attempt on the model rung ' +
    'before escalating for model evidence', (t) => {
    const {root, quest} = setup({metric: 5, target: 0});
    quest.statement = 'lifecycle owner-boundary model contract needs proof';
    saveQuest(root, quest);
    ingestEvidence(root, {
      questId: quest.id,
      frontierId: 'f1',
      evidencePath: quest.frontiers[0].metric.args.file,
    });
    appendEvent(root, quest.id, {
      type: EVENT_ATTEMPT,
      frontier: 'f1',
      rung: 'model',
      rungIndex: 3,
      metricBefore: 5,
      metricAfter: 5,
      changeRef: 'diff:solve/changes/g1/model-seed.diff',
    });
    appendEvent(root, quest.id, {
      type: 'theory-system-declared',
      theory: 'system-model',
      scope: 'system',
      status: THEORY_RESULT_ACTIVE,
      mechanism: 'lifecycle_model',
    });
    appendEvent(root, quest.id, {
      type: EVENT_THEORY_OPTION_DECLARED,
      theory: 'frontier-model',
      frontier: 'f1',
      scope: 'frontier',
      status: THEORY_RESULT_ACTIVE,
      layer: 'model',
      mechanism: 'lifecycle_model',
      intervention: 'prove lifecycle contract',
      expectedMovement: 'metric decreases',
      negativeResultMeans: 'model contract is not the blocker',
      discriminator: 'npm run model:contracts',
      promotionRule: 'model report supports contract',
      rejectionRule: 'model report refutes contract',
    });
    appendEvent(root, quest.id, {
      type: EVENT_THEORY_SELECTED,
      frontier: 'f1',
      theory: 'frontier-model',
    });

    let executorCalls = 0;
    const res = runLoop(root, quest, {
      executor: {
        run() {
          executorCalls += 1;
          return {changeRef: null, summary: 'model attempt'};
        },
      },
      maxCycles: 1,
    });
    const advisories = readLog(root, quest.id).filter((event) =>
      event.type === EVENT_GATE_DECISION &&
      event.disposition === DISPOSITION_ADVISORY &&
      event.code === CONTINUATION_BLOCKED_THEORY);
    // P5b: model evidence is over-eager as an immediate stop. Soft-first now grants the
    // model rung a bounded exploratory attempt to PRODUCE evidence; the hard requirement
    // is still enforced at commit time by auditModelEvidence.
    t.not(res.outcome, OUTCOME_THEORY_REQUIRED, 'model evidence does not hard-stop on first sight');
    t.equal(executorCalls, 1, 'executor was invoked under the soft-first advisory');
    t.equal(advisories.length, 1, 'one model-evidence advisory recorded for the cycle');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

// The loop auto-commits the quest's scope-clean work. Each verified, scope-clean
// attempt is persisted mid-run as a squashable `checkpoint(quest):` commit (so a long
// non-terminal quest never accumulates an unrecoverable dirty tree), and the quest's
// finish produces one durable terminal commit. It never pushes.
tap.test('auto-commit on quest finish (loop path)', async (t) => {
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

  // A doc-path change artifact so the source-change-verification gate does not
  // demand a subagent finding; the loop can then auto-commit once the quest finishes.
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

  t.test('checkpoints each verified attempt and makes a terminal commit, never pushes', (t) => {
    const {root, quest, changeDir} = setup({metric: 2, target: 0});
    saveQuest(root, quest);
    initGit(root);
    const before = Number(commitCount(root));
    const res = runLoop(root, quest, {
      executor: docExecutor(changeDir),
      maxCycles: 50,
    });
    t.equal(res.outcome, STATUS_SOLVED, 'quest solved');
    const after = Number(commitCount(root));
    // Each verified attempt is checkpointed mid-run; the finish adds the durable
    // terminal commit. So there is at least one checkpoint plus exactly one terminal.
    const subjects = execFileSync('git',
      ['log', '--format=%s', '-n', String(after - before)],
      {cwd: root, encoding: 'utf8'}).trim().split('\n').filter(Boolean);
    const checkpoints = subjects.filter((s) => s.startsWith('checkpoint(quest):'));
    const terminals = subjects.filter((s) => !s.startsWith('checkpoint(quest):'));
    t.ok(checkpoints.length >= 1, 'mid-run attempts are persisted as checkpoints');
    t.equal(terminals.length, 1, 'exactly one durable terminal commit on finish');
    t.notMatch(subjects[0], /^checkpoint\(quest\):/u,
      'the HEAD commit is the terminal commit, not a checkpoint');
    const msg = execFileSync('git', ['log', '-1', '--format=%B'],
      {cwd: root, encoding: 'utf8'});
    t.match(msg, /Co-authored-by: Copilot/, 'the commit carries the co-author trailer');
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

// P6 invalid-sample hygiene: a positively-classified non-measuring sample
// (invalidSample === true) is not a stall. It must HOLD the rung and retry (emitting an
// advisory diagnostic) rather than climb the ladder toward an `exhausted` park it never
// earned. The retry is bounded: once CANNOT_MEASURE_RETRY_BUDGET consecutive samples fail
// to measure, the frontier parks as cannot_measure — a harness verdict, never exhausted.
tap.test('P6 non-measuring samples hold the rung and park as cannot_measure', async (t) => {
  // A probe driven by an on-disk flag file: when {invalid:true} it returns a
  // non-measuring sample (metric null, invalidSample true); otherwise a real metric.
  registerProbe('flaky-p6', {
    name: 'flaky-p6',
    measure(args) {
      const data = JSON.parse(fs.readFileSync(args.file, 'utf8'));
      if (data.invalid) {
        return {metric: null, done: false, invalidSample: true, evidence: args.file};
      }
      return {metric: data.metric, done: data.metric <= 0, evidence: args.file};
    },
  });

  function p6setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-p6-'));
    const file = path.join(root, 'flag.json');
    fs.writeFileSync(file, JSON.stringify({metric: 5, invalid: true}));
    const quest = {
      id: 'p6',
      statement: 'non-measuring hygiene',
      priority: 100,
      doneWhen: {probe: 'flaky-p6', args: {file}},
      frontiers: [{id: 'f1', priority: 1, metric: {probe: 'flaky-p6', args: {file}}}],
    };
    saveQuest(root, quest);
    appendEvent(root, quest.id, {type: 'quest-declared', quest});
    return {root, quest, file};
  }

  function attempt(root, quest) {
    const state = projectState(quest, readLog(root, quest.id));
    const pick = {def: quest.frontiers[0], state: state.frontiers[0]};
    const ctx = makeRunContext({
      changeRef: 'diff:doc-only.diff',
      changeRefResolves: () => true,
      inspectChangeRef: () => ({valid: true, problems: []}),
      autoCommit: false,
    });
    ctx.probeCtx = {root};
    const before = {metric: 5, evidence: quest.frontiers[0].metric.args.file};
    return finalizeAttempt(root, quest, ctx, pick, before,
      {changeRef: 'diff:doc-only.diff', summary: 'non-measuring attempt'});
  }

  t.test('holds the rung and emits an advisory before the budget runs out', (t) => {
    const {root, quest} = p6setup();
    attempt(root, quest);
    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.frontiers[0].rungIndex, 0, 'rung held at observe (no climb)');
    t.equal(state.frontiers[0].status, 'open', 'frontier not parked yet');
    const findings = readLog(root, quest.id)
      .filter((e) => e.type === EVENT_FINDING && e.frontier === 'f1');
    t.equal(findings.length, 1, 'one advisory diagnostic recorded');
    t.match(findings[0].claim, /non-measuring sample/u, 'advisory points at the harness');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('parks as cannot_measure once the retry budget is spent', (t) => {
    const {root, quest} = p6setup();
    for (let i = 0; i < CANNOT_MEASURE_RETRY_BUDGET; i++) attempt(root, quest);
    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.frontiers[0].status, STATUS_PARKED, 'frontier parked');
    t.equal(state.frontiers[0].parkKind, PARK_KIND_CANNOT_MEASURE,
      'parked as cannot_measure, never exhausted');
    t.equal(state.frontiers[0].rungIndex, 0,
      'never climbed the ladder on non-measuring samples');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a measuring sample resets the non-measuring run', (t) => {
    const {root, quest, file} = p6setup();
    attempt(root, quest);
    attempt(root, quest);
    // A trustworthy sample interrupts the run; the next invalid sample starts over,
    // so the budget never trips from samples split across a real measurement.
    fs.writeFileSync(file, JSON.stringify({metric: 4, invalid: false}));
    const state0 = projectState(quest, readLog(root, quest.id));
    const pick = {def: quest.frontiers[0], state: state0.frontiers[0]};
    const ctx = makeRunContext({
      changeRef: 'diff:doc-only.diff',
      changeRefResolves: () => true,
      inspectChangeRef: () => ({valid: true, problems: []}),
      autoCommit: false,
    });
    ctx.probeCtx = {root};
    finalizeAttempt(root, quest, ctx, pick, {metric: 5},
      {changeRef: 'diff:doc-only.diff', summary: 'measuring progress'});
    fs.writeFileSync(file, JSON.stringify({metric: 4, invalid: true}));
    attempt(root, quest);
    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.frontiers[0].status, 'open',
      'measuring sample reset the run; one later invalid sample does not park');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

tap.test('mandatory reflection turn (loop integration)', async (t) => {
  // A progressing executor (step 1) on a far-from-target metric makes a real measured attempt
  // every cycle, so REFLECTION_INTERVAL attempts accumulate and a cadence reflection becomes
  // due — without tripping the pre-loop unrecorded-evidence gate.
  function reflective(changeDir, onReflect) {
    const base = makeDryExecutor({step: 1, changeDir});
    return {
      ...base,
      name: 'reflective',
      run: (task) => base.run(task),
      reflect: (task) => onReflect(task),
    };
  }

  t.test('a cadence reflection records a note and skips that cycle attempt', (t) => {
    const {root, quest, changeDir} = setup({metric: 100, target: 0});
    saveQuest(root, quest);
    let reflectCalls = 0;
    const note = 'reframed: the coupling, not the local fix, is the real frontier';
    runLoop(root, quest, {
      executor: reflective(changeDir, (task) => {
        reflectCalls += 1;
        t.equal(task.trigger, 'cadence', 'the executor is told why it is reflecting');
        t.match(task.prompt, /Step back/, 'a gate-free reflection prompt is supplied');
        return {reflection: note};
      }),
      maxCycles: REFLECTION_INTERVAL + 1,
    });
    const log = readLog(root, quest.id);
    const reflections = log.filter((e) => e.type === EVENT_REFLECTION);
    const attempts = log.filter((e) => e.type === EVENT_ATTEMPT);
    t.equal(reflectCalls, 1, 'reflect() fired once, at the cadence boundary');
    t.equal(reflections.length, 1, 'exactly one reflection note was recorded');
    t.equal(reflections[0].note, note, 'the agent reframing is persisted');
    t.equal(reflections[0].trigger, 'cadence', 'recorded under the cadence trigger');
    t.equal(attempts.length, REFLECTION_INTERVAL,
      'the reflection cycle made no attempt (pure think turn)');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a recorded reflection resets the cadence (no back-to-back reflections)', (t) => {
    const {root, quest, changeDir} = setup({metric: 100, target: 0});
    saveQuest(root, quest);
    let reflectCalls = 0;
    // Run well past a single interval: a second reflection only becomes due after another
    // REFLECTION_INTERVAL attempts, so the cadence cannot fire every cycle.
    runLoop(root, quest, {
      executor: reflective(changeDir, () => {
        reflectCalls += 1;
        return {reflection: 'one reframe'};
      }),
      maxCycles: REFLECTION_INTERVAL + REFLECTION_INTERVAL,
    });
    t.equal(reflectCalls, 1, 'cadence reset after the first reflection');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a non-reflective (dry) executor is unaffected: no reflection is recorded', (t) => {
    const {root, quest, changeDir} = setup({metric: 100, target: 0});
    saveQuest(root, quest);
    runLoop(root, quest, {
      executor: makeDryExecutor({step: 1, changeDir}),
      maxCycles: REFLECTION_INTERVAL + 2,
    });
    const reflections = readLog(root, quest.id).filter((e) => e.type === EVENT_REFLECTION);
    t.equal(reflections.length, 0,
      'a driver without reflect() never has the loop record a reflection');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

tap.test('durableProgressCount counts durable knowledge, not gate noise', (t) => {
  t.equal(durableProgressCount([]), 0, 'empty log has no progress');
  t.equal(durableProgressCount(null), 0, 'null log is safe');
  const log = [
    {type: EVENT_ATTEMPT, invalidSample: false, metricAfter: 2},
    {type: EVENT_ATTEMPT, invalidSample: true},
    {type: EVENT_EVIDENCE_INGESTED, invalidSample: false, metric: 1},
    {type: EVENT_EVIDENCE_INGESTED, invalidSample: false, metric: null},
    {type: EVENT_FINDING},
    {type: EVENT_THEORY_RESULT},
    {type: EVENT_THEORY_SELECTED},
    {type: EVENT_THEORY_OPTION_DECLARED},
    {type: EVENT_FRONTIER_REOPENED},
    {type: EVENT_REFLECTION},
    {type: EVENT_PARK},
    {type: EVENT_GATE_DECISION},
    {type: EVENT_GATE_DECISION},
  ];
  // Knowledge + real state changes count: measured attempt + measuring evidence + finding
  // + reflection + park = 5. EXCLUDED as churn a stuck Solver emits every cycle: invalid
  // samples, null-metric evidence, gate-decisions, AND the per-frontier theory bookkeeping
  // (theory-result/selected/option-declared) plus frontier reopens — so pure whack-a-mole
  // theory churn can no longer masquerade as progress and defeat the stall guard.
  t.equal(durableProgressCount(log), 5,
    'measured attempt + measuring evidence + finding + reflection + park; invalid samples, ' +
    'gate-decisions, theory bookkeeping, and reopens excluded');
  t.end();
});

tap.test('runSupervised (P-keepalive) keeps the quest alive across non-terminal stops', (t) => {
  const quest = {id: 'sup', frontiers: [{id: 'f1'}]};

  t.test('restarts on MAX_CYCLES and passes a SOLVED terminal through', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'));
    // Each runner call appends one measured attempt (durable progress) and returns
    // MAX_CYCLES twice, then SOLVED. The supervisor must restart through the two
    // non-terminal stops and report the honest terminal.
    const outcomes = [OUTCOME_MAX_CYCLES, OUTCOME_MAX_CYCLES, STATUS_SOLVED];
    let calls = 0;
    const runner = (r, q) => {
      appendEvent(r, q.id, {type: EVENT_ATTEMPT, frontier: 'f1', invalidSample: false,
        metricAfter: 2 - calls});
      return {outcome: outcomes[calls++], evidence: null};
    };
    const res = runSupervised(root, quest, {runner});
    t.equal(res.outcome, STATUS_SOLVED, 'reports the honest terminal');
    t.equal(calls, 3, 'restarted twice before solving');
    t.equal(res.supervisor.restarts, 2, 'records the restart count');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a measurement park steps back immediately (a dead harness cannot self-heal)', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'));
    let calls = 0;
    const runner = () => {
      calls++;
      return {outcome: OUTCOME_BLOCKED, disposition: DISPOSITION_PARK_RESUMABLE,
        frontier: 'f1', evidence: null};
    };
    const res = runSupervised(root, quest, {runner});
    t.equal(res.outcome, OUTCOME_SUPERVISOR_PAUSED_MEASUREMENT, 'pauses on measurement');
    t.equal(calls, 1, 'does not restart a dead harness');
    t.equal(res.supervisor.innerOutcome, OUTCOME_BLOCKED, 'preserves the inner outcome');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('stalls out when restarts stop producing durable progress', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'));
    let calls = 0;
    // A recoverable explore stop that only ever appends gate-decision noise: no durable
    // progress accrues, so the stall guard must step back rather than spin forever.
    const runner = (r, q) => {
      calls++;
      appendEvent(r, q.id, {type: EVENT_GATE_DECISION, frontier: 'f1'});
      return {outcome: OUTCOME_BLOCKED, disposition: DISPOSITION_EXPLORE,
        frontier: 'f1', evidence: null};
    };
    const res = runSupervised(root, quest, {runner, stallWindow: 3});
    t.equal(res.outcome, OUTCOME_SUPERVISOR_STALLED, 'steps back on a hot spin');
    t.equal(calls, 3, 'one initial run + two stale restarts before the window trips');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('honors the restart budget', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-'));
    let calls = 0;
    // Each restart makes durable progress (so the stall guard never fires) but never
    // terminates; the restart budget is the backstop.
    const runner = (r, q) => {
      appendEvent(r, q.id, {type: EVENT_FINDING, frontier: 'f1', n: calls++});
      return {outcome: OUTCOME_MAX_CYCLES, evidence: null};
    };
    const res = runSupervised(root, quest, {runner, maxRestarts: 5});
    t.equal(res.outcome, OUTCOME_SUPERVISOR_BUDGET, 'stops at the restart budget');
    t.equal(res.supervisor.restarts, 5, 'used the full budget');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.end();
});
