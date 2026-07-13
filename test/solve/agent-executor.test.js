import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {makeAgentExecutor, loadAgentConfig, configFilePath}
  from '../../scripts/solve/agent-executor.js';
import {runLoop} from '../../scripts/solve/loop.js';
import {saveQuest, readLog} from '../../scripts/solve/store.js';
import {
  EVENT_ATTEMPT,
  EVENT_SOLVED,
  EVENT_VIOLATION,
  OUTCOME_THEORY_REQUIRED,
} from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-'));
}

const NO_OP_CHANGE_NAME = 'no-op';

function writeSourceChangeArtifact(root, questId, name) {
  const diff = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(diff), {recursive: true});
  fs.writeFileSync(diff, [
    'diff --git a/src/oracle.js b/src/oracle.js',
    '--- a/src/oracle.js',
    '+++ b/src/oracle.js',
    '@@ -1 +1 @@',
    '-before',
    '+after',
  ].join('\n'));
  return `diff:${diff}`;
}

const TASK = {
  quest: {id: 'g', statement: 's', constraints: ['x']},
  frontierDef: {id: 'f', metric: {probe: 'oracle', args: {file: 'o', metric: 'priority'}}},
  frontierState: {findings: [{claim: 'Y ruled out', rulesOut: 'Y'}]},
  rung: 'observe',
  rungIndex: 0,
  metricHistory: [3, 2],
  evidencePaths: ['test-output/reports/a.report.json'],
};

const CONFIG = {
  enabled: true,
  agentCommand: `${process.execPath} {requestFile} {responseFile}`,
  timeoutMs: 5000,
};

tap.test('agent executor (P4)', async (t) => {
  t.test('writes the dossier to the request file and reads the response', (t) => {
    const root = tmp();
    let seenRequest = null;
    const spawn = (cmd, args, opts) => {
      const [reqFile, resFile] = args;
      seenRequest = JSON.parse(fs.readFileSync(reqFile, 'utf8'));
      t.equal(opts.env.SOLVE_REQUEST_FILE, reqFile, 'request env exported');
      t.equal(opts.env.SOLVE_RESPONSE_FILE, resFile, 'response env exported');
      t.equal(opts.cwd, root, 'agent runs from repo root');
      const diff = path.join(root, 'agent.diff');
      fs.writeFileSync(diff, '# change\n');
      fs.writeFileSync(resFile, JSON.stringify({changeRef: `diff:${diff}`, summary: 'did it'}));
      return {status: 0};
    };
    const ex = makeAgentExecutor(root, {config: CONFIG, spawn});
    const out = ex.run(TASK);
    t.match(out.changeRef, /^diff:/);
    t.equal(out.summary, 'did it');
    t.equal(seenRequest.frontier, 'f');
    t.match(seenRequest.rungPrompt, /Rung 0 \(observe\)/);
    t.same(seenRequest.metricHistory, [3, 2]);
    t.same(seenRequest.evidencePaths, ['test-output/reports/a.report.json']);
    t.match(seenRequest.rungPrompt, /rules out: Y/, 'findings reach the dossier');
    t.same(seenRequest.constraints, ['x']);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a missing/invalid response is a no-op (null changeRef)', (t) => {
    const root = tmp();
    const spawn = () => ({status: 0}); // writes no response file
    const out = makeAgentExecutor(root, {config: CONFIG, spawn}).run(TASK);
    t.equal(out.changeRef, null, 'no-op so honesty rejects any movement claim');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a non-zero exit is a no-op', (t) => {
    const root = tmp();
    const spawn = () => ({status: 3});
    t.equal(makeAgentExecutor(root, {config: CONFIG, spawn}).run(TASK).changeRef, null);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a timeout is a no-op', (t) => {
    const root = tmp();
    const spawn = () => ({error: {code: 'ETIMEDOUT'}});
    const out = makeAgentExecutor(root, {config: CONFIG, spawn}).run(TASK);
    t.equal(out.changeRef, null);
    t.match(out.summary, /timeout/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('malformed JSON response is a no-op', (t) => {
    const root = tmp();
    const spawn = (cmd, args) => {
      fs.writeFileSync(args[1], 'not json');
      return {status: 0};
    };
    t.equal(makeAgentExecutor(root, {config: CONFIG, spawn}).run(TASK).changeRef, null);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('loadAgentConfig requires an explicitly enabled live config', (t) => {
    const root = tmp();
    t.throws(() => loadAgentConfig(root), /unavailable/, 'missing config throws');
    const file = configFilePath(root);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, JSON.stringify({enabled: true, timeoutMs: 1}));
    t.throws(() => loadAgentConfig(root), /agentCommand/, 'missing command throws');
    fs.writeFileSync(file, JSON.stringify({...CONFIG, enabled: false}));
    t.throws(() => loadAgentConfig(root), /disabled/, 'disabled config throws');
    fs.writeFileSync(file, JSON.stringify(CONFIG));
    t.equal(loadAgentConfig(root).agentCommand, CONFIG.agentCommand);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  // End-to-end: the loop drives a mock agent that moves a file-backed oracle, proving
  // truth comes from the probe (re-measure), not from the agent's self-report.
  t.test('loop + mock agent reaches SOLVED via real metric movement', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
    const quest = {
      id: 'g2', statement: 'drive oracle to zero', priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [{id: 'f2', priority: 1,
        metric: {probe: 'oracle', args: {file: oracle, metric: 'priority'}}}],
    };
    saveQuest(root, quest);
    const spawn = (cmd, args) => {
      // The "agent" makes a real change: decrement the oracle + leave a diff artifact.
      const data = JSON.parse(fs.readFileSync(oracle, 'utf8'));
      data.metric = Math.max(0, data.metric - 1);
      fs.writeFileSync(oracle, JSON.stringify(data));
      const changeRef = writeSourceChangeArtifact(root, quest.id, `c-${data.metric}`);
      fs.writeFileSync(args[1], JSON.stringify({changeRef, summary: 'step'}));
      return {status: 0};
    };
    const executor = makeAgentExecutor(root, {config: CONFIG, spawn});
    const result = runLoop(root, quest, {executor, maxCycles: 20});
    t.equal(result.outcome, 'solved');
    const log = readLog(root, quest.id);
    t.ok(log.some((e) => e.type === EVENT_SOLVED), 'frontier solved');
    t.ok(log.filter((e) => e.type === EVENT_ATTEMPT).length >= 2, 'multiple attempts');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('loop + agent that does nothing stops at theory gate', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'o.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 5, target: 0}));
    const quest = {
      id: 'g3', statement: 's', priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [{id: 'f3', priority: 1,
        metric: {probe: 'oracle', args: {file: oracle, metric: 'priority'}}}],
    };
    saveQuest(root, quest);
    // Agent never changes the metric, but reports a sealed patch artifact. The no-op
    // climbs observe -> local-fix ->
    // widen-scope, where soft-first grants ONE exploratory attempt; that no-op stall
    // climbs into the model rung, whose model/system theory gate is excluded from
    // soft-first and hard-stops before invoking the agent again.
    const spawn = (cmd, args) => {
      const changeRef = writeSourceChangeArtifact(root, quest.id, NO_OP_CHANGE_NAME);
      fs.writeFileSync(args[1], JSON.stringify({changeRef, summary: 'no-op'}));
      return {status: 0};
    };
    const executor = makeAgentExecutor(root, {config: CONFIG, spawn});
    const result = runLoop(root, quest, {executor, maxCycles: 20});
    const log = readLog(root, quest.id);
    const attempts = log.filter((event) => event.type === EVENT_ATTEMPT);
    const violations = log.filter((event) => event.type === EVENT_VIOLATION);
    t.equal(result.outcome, OUTCOME_THEORY_REQUIRED);
    t.equal(attempts.length, 3, 'soft-first bounds the no-op agent (1 exploratory attempt)');
    t.equal(violations[violations.length - 1].scope, 'theory-gate');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

tap.test('agent executor reflect() over the generic file contract', async (t) => {
  const REFLECT_TASK = {
    quest: {id: 'g', statement: 's'},
    health: {frontier: 'f', signals: [{type: 'coupled-invariant-oscillation'}],
      nextAction: 'reframe'},
    trigger: 'oscillation',
    prompt: 'Step back and reflect on quest g.',
  };

  t.test('writes a reflection request and reads back the note', (t) => {
    const root = tmp();
    let seenRequest = null;
    const spawn = (cmd, args, opts) => {
      const [reqFile, resFile] = args;
      seenRequest = JSON.parse(fs.readFileSync(reqFile, 'utf8'));
      t.equal(opts.cwd, root, 'reflection runs from repo root');
      fs.writeFileSync(resFile, JSON.stringify({reflection: 'the coupling is the frontier'}));
      return {status: 0};
    };
    const ex = makeAgentExecutor(root, {config: CONFIG, spawn});
    const out = ex.reflect(REFLECT_TASK);
    t.equal(out.reflection, 'the coupling is the frontier', 'note returned to the loop');
    t.equal(seenRequest.kind, 'reflection', 'request is tagged as a reflection turn');
    t.equal(seenRequest.questId, 'g', 'carries the quest id');
    t.equal(seenRequest.trigger, 'oscillation', 'carries the trigger');
    t.same(seenRequest.signals, [{type: 'coupled-invariant-oscillation'}],
      'carries the health snapshot');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a non-zero / malformed reflection run yields a null note (still recordable)', (t) => {
    const root = tmp();
    const failSpawn = () => ({status: 1});
    const failOut = makeAgentExecutor(root, {config: CONFIG, spawn: failSpawn})
      .reflect(REFLECT_TASK);
    t.equal(failOut.reflection, null, 'a failed reflection has no note');
    const malformedSpawn = (cmd, args) => {
      fs.writeFileSync(args[1], 'not json');
      return {status: 0};
    };
    const malformedOut = makeAgentExecutor(root, {config: CONFIG, spawn: malformedSpawn})
      .reflect(REFLECT_TASK);
    t.equal(malformedOut.reflection, null, 'a malformed reflection has no note');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
