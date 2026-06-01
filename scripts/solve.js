#!/usr/bin/env node
// solve — CLI for the minimal autonomy-first solver.
//
// Subcommands:
//   new     scaffold a quest file you then edit (the only authored artifact)
//   run     run the control loop to a terminal (SOLVED / EXHAUSTED), then report
//   status  print the projected state (frontiers, rungs, metrics)
//   report  (re)generate and print the markdown result projection
//   probe   ad-hoc: ask a probe for {metric, done, evidence} without recording
//
// The CLI is a thin shell over scripts/solve/*. All Quest truth lives in the
// append-only log; reports and state are projections.

import fs from 'node:fs';
import path from 'node:path';

import {loadQuest, saveQuest, readLog, projectState, appendFinding, questFilePath}
  from './solve/store.js';
import {makeDryExecutor} from './solve/executor.js';
import {makeAgentExecutor} from './solve/agent-executor.js';
import {runLoop} from './solve/loop.js';
import {writeReport} from './solve/report.js';
import {getProbe} from './solve/probe.js';
import {stepBegin, stepCommit, stepAbort, stepPending} from './solve/step.js';
import {SOLVE_DATA_DIR} from './solve/constants.js';

function parseArgs(argv) {
  const args = {_: []};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function questTemplate(id, statement) {
  return {
    id,
    statement: statement || 'Describe the terminal success condition in one line.',
    priority: 1,
    // done_when: the binary, artifact-bound success predicate. Sealed once declared.
    doneWhen: {
      probe: 'scenario-harness',
      args: {scenario: id, consecutive: 3, metric: 'priority'},
    },
    // frontiers: independent work surfaces. Each carries its own lower-is-better
    // metric (the progress gradient). The scheduler picks among open frontiers.
    frontiers: [
      {
        id: `${id}-main`,
        priority: 1,
        metric: {
          probe: 'scenario-harness',
          args: {scenario: id, metric: 'priority'},
        },
      },
    ],
  };
}

function cmdNew(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('new: --id <questId> is required');
  const file = questFilePath(root, id);
  if (fs.existsSync(file) && !args.force) {
    throw new Error(`new: ${file} already exists (use --force to overwrite)`);
  }
  const quest = questTemplate(id, typeof args.statement === 'string' ?
    args.statement : null);
  const written = saveQuest(root, quest);
  process.stdout.write(`created ${written}\nEdit it, then: solve run --id ${id}\n`);
}

function cmdRun(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('run: --id <questId> is required');
  const quest = loadQuest(root, id);
  const executor = buildExecutor(root, id, args);
  const options = {executor};
  if (args.max !== undefined) options.maxCycles = Number(args.max);
  const result = runLoop(root, quest, options);
  const {file} = writeReport(root, id);
  process.stdout.write(
    `terminal: ${result.outcome}\nevidence: ${result.evidence || '(none)'}\n` +
    `report: ${file}\n`);
}

function buildExecutor(root, id, args) {
  const kind = args.executor || 'dry';
  if (kind === 'dry') {
    return makeDryExecutor({
      changeDir: path.join(root, SOLVE_DATA_DIR, 'changes', id),
      step: Number(args.step) || 1,
    });
  }
  if (kind === 'agent') {
    // Real edits: gated behind an explicit flag so it is never the default.
    if (!args.yes) {
      throw new Error(
        'run --executor agent performs real edits; pass --yes to confirm');
    }
    return makeAgentExecutor(root, {repoRoot: root});
  }
  throw new Error(`run: unknown executor "${kind}" (use dry|agent)`);
}

function cmdStatus(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('status: --id <questId> is required');
  const quest = loadQuest(root, id);
  const state = projectState(quest, readLog(root, id));
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}

function cmdReport(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('report: --id <questId> is required');
  const {file, md} = writeReport(root, id);
  process.stdout.write(`${md}\n(written to ${file})\n`);
}

function cmdProbe(root, args) {
  const name = args.probe;
  if (!name) throw new Error('probe: --probe <name> is required');
  const probe = getProbe(name);
  const probeArgs = {...args};
  delete probeArgs._;
  delete probeArgs.probe;
  const result = probe.measure(probeArgs, {});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function cmdFinding(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('finding: --id <questId> is required');
  if (!args.frontier) throw new Error('finding: --frontier <frontierId> is required');
  if (typeof args.claim !== 'string') {
    throw new Error('finding: --claim "<what was learned>" is required');
  }
  loadQuest(root, id);
  const stamped = appendFinding(root, id, {
    frontier: args.frontier,
    claim: args.claim,
    evidence: typeof args.evidence === 'string' ? args.evidence : null,
    rulesOut: typeof args.rulesOut === 'string' ? args.rulesOut : null,
  });
  process.stdout.write(`recorded finding for ${args.frontier} @ ${stamped.ts}\n`);
}

function stepCommitCmd(root, quest, args) {
  const r = stepCommit(root, quest, {
    changeRef: typeof args.changeRef === 'string' ? args.changeRef : undefined,
    summary: typeof args.summary === 'string' ? args.summary : undefined,
  });
  const moved = r.progressed ? 'PROGRESS' : 'flat';
  const viol = r.violations.length ? ` violations: ${r.violations.join('; ')}` : '';
  process.stdout.write(
    `recorded attempt on ${r.frontier}: metric ${r.before} -> ${r.after} ` +
    `(${moved})${r.done ? ' DONE' : ''}${viol}\n`);
}

function stepBeginCmd(root, quest, id, args = {}) {
  const out = stepBegin(root, quest, {force: Boolean(args.force)});
  if (out.terminal === 'solved') {
    process.stdout.write(`SOLVED — evidence: ${out.evidence || '(none)'}\n`);
    return;
  }
  if (out.terminal === 'exhausted') {
    process.stdout.write('EXHAUSTED — no open frontier; human decision needed\n');
    return;
  }
  process.stdout.write(
    `${out.dossier}\n\n` +
    `# baseline metric: ${out.before.metric}\n` +
    '# Do the work, re-run the harness, then:\n' +
    `#   solve step --id ${id} --commit --changeRef diff:<path> ` +
    '--summary "<hypothesis>"\n');
}

function cmdStep(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('step: --id <questId> is required');
  const quest = loadQuest(root, id);
  if (args.abort) {
    process.stdout.write(stepAbort(root, id) ?
      'pending step aborted\n' : 'no pending step\n');
    return;
  }
  if (args.commit) {
    stepCommitCmd(root, quest, args);
    return;
  }
  if (stepPending(root, id) && !args.force) {
    throw new Error('a step is already pending; use --commit, --abort, or --force');
  }
  stepBeginCmd(root, quest, id, args);
}

const COMMANDS = {
  new: cmdNew,
  run: cmdRun,
  status: cmdStatus,
  report: cmdReport,
  probe: cmdProbe,
  finding: cmdFinding,
  step: cmdStep,
};

function main() {
  const [, , command, ...rest] = process.argv;
  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(
      `usage: solve <${Object.keys(COMMANDS).join('|')}> [--id <questId>] [...]\n`);
    process.exit(command ? 1 : 0);
    return;
  }
  const args = parseArgs(rest);
  const root = args.root || process.cwd();
  try {
    handler(root, args);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(1);
  }
}

main();
