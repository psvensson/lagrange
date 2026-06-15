#!/usr/bin/env node
// solve — CLI for the minimal autonomy-first solver.
//
// Subcommands:
//   new     scaffold a quest file you then edit (the only authored artifact)
//   run     run the control loop to a terminal or non-terminal gate, then report
//   status  print the projected state (frontiers, rungs, metrics)
//   report  (re)generate and print the markdown result projection
//   portfolio cross-quest governance view (class/closure/outcome + meta ratio)
//   frontier one-screen board: active closure-ledger records + open quests
//   probe   ad-hoc: ask a probe for {metric, done, evidence} without recording
//   theory  record two-layer Quest theories and their outcomes
//   health  print Quest loop-health and next-action signals
//   attempt run a command through the atomic measured-attempt path
//   audit   validate Quest workflow integrity
//   handoff compute the scope-safe git commit pathspec for one Quest
//   upgrade establish a strict-audit baseline for an existing legacy Quest
//   reopen  re-open a frontier parked on non-measuring samples (evidence-gated)
//   override authorize one recorded-reason bypass of an overridable soft guard
//   reflect record a step-back reflection (free-form reframing) turn
//
// The CLI is a thin shell over scripts/solve/*. All Quest truth lives in the
// append-only log; reports and state are projections.

import fs from 'node:fs';
import path from 'node:path';

import {loadQuest, saveQuest, readLog, projectState, appendFinding, questFilePath,
  appendGuardOverride, appendReflection}
  from './solve/store.js';
import {makeDryExecutor} from './solve/executor.js';
import {makeAgentExecutor} from './solve/agent-executor.js';
import {runLoop, runSupervised} from './solve/loop.js';
import {writeReport} from './solve/report.js';
import {runStep, stepAbort, stepPending} from './solve/step.js';
import {SOLVE_DATA_DIR} from './solve/constants.js';
import {runTheoryCommand, theoryCommitArgs} from './solve/theory.js';
import {analyzeQuestHealth, renderHealth} from './solve/health.js';
import {buildAdvisories, renderAdvisoryLines} from './solve/advisories.js';
import {buildCurrentBlocker} from './solve/current-blocker.js';
import {analyzeScopePressure} from './solve/scope-pressure.js';
import {detectUnrecordedEvidence, ingestEvidence} from './solve/evidence.js';
import {runAttemptCommand} from './solve/attempt.js';
import {runAuditCommand} from './solve/audit.js';
import {runUpgradeCommand} from './solve/upgrade.js';
import {runReopenCommand} from './solve/reopen.js';
import {runPortfolioCommand} from './solve/portfolio.js';
import {runFrontierCommand} from './solve/frontier.js';
import {runHandoffCommand} from './solve/handoff.js';
import {evaluate} from './solve/probe.js';
import {
  CONTINUATION_BLOCKED_THEORY,
  CONTINUATION_BLOCKED_SCOPE,
  continuationOverridable,
} from './solve/continuation.js';

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
        if (args[key] === undefined) {
          args[key] = next;
        } else if (Array.isArray(args[key])) {
          args[key].push(next);
        } else {
          args[key] = [args[key], next];
        }
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
    // class: "product" (default) goals must be MEASURED against a real artifact;
    // "process" goals are scaffolding/decision records and may close on an oracle.
    // This drives report closure-strength labeling and the audit closure-mismatch warning.
    class: 'product',
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
    constraints: [
      {
        id: 'source-change-subagent-verification',
        statement: 'If this Quest changes source code, spawn a subagent verifier before audit and git handoff, then record a Solver finding with evidence subagent:<id>.',
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

function buildRunOptions(root, id, args) {
  const executor = buildExecutor(root, id, args);
  const options = {executor};
  if (args.max !== undefined) options.maxCycles = Number(args.max);
  if (args['no-push']) options.push = false;
  if (args['no-commit']) options.autoCommit = false;
  if (args['commit-every'] !== undefined) {
    options.commitEvery = Number(args['commit-every']);
  }
  if (args['push-every'] !== undefined) {
    options.pushEvery = Number(args['push-every']);
  }
  return options;
}

function writeRunOutcome(root, id, result) {
  const {file} = writeReport(root, id);
  const problems = result.problems?.length ?
    `problems:\n${result.problems.map((problem) => `- ${problem}`).join('\n')}\n` :
    '';
  const disposition = result.disposition ?
    `disposition: ${result.disposition}\n` : '';
  const next = result.nextCommand ? `next: ${result.nextCommand}\n` : '';
  const supervisor = result.supervisor ?
    `supervisor: ${result.supervisor.stop} ` +
    `(restarts: ${result.supervisor.restarts}` +
    (result.supervisor.innerOutcome ?
      `, inner: ${result.supervisor.innerOutcome}` : '') + ')\n' : '';
  process.stdout.write(
    `terminal: ${result.outcome}\nevidence: ${result.evidence || '(none)'}\n` +
    supervisor +
    disposition +
    problems +
    next +
    commitLine(result.commit) +
    `report: ${file}\n`);
}

function cmdRun(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('run: --id <questId> is required');
  const quest = loadQuest(root, id);
  const options = buildRunOptions(root, id, args);
  if (args['keep-alive']) {
    if (args['max-restarts'] !== undefined) {
      options.maxRestarts = Number(args['max-restarts']);
    }
    if (args['stall-window'] !== undefined) {
      options.stallWindow = Number(args['stall-window']);
    }
    options.onRestart = ({restarts, innerOutcome}) => process.stderr.write(
      `supervisor: restart ${restarts} after ${innerOutcome}\n`);
    writeRunOutcome(root, id, runSupervised(root, quest, options));
    return;
  }
  writeRunOutcome(root, id, runLoop(root, quest, options));
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

function questAdvisories(root, quest, log) {
  const health = analyzeQuestHealth(root, quest);
  return buildAdvisories(quest, health, log || readLog(root, quest.id));
}

// Print the workflow advisories (reflection-due / override-available) for a quest, so a
// supervised driver sees the same nudges the autonomous loop would act on. No-op when none.
function emitAdvisories(root, quest) {
  const advisories = questAdvisories(root, quest);
  if (advisories.length === 0) return;
  process.stdout.write(`${renderAdvisoryLines(advisories).join('\n')}\n`);
}

function cmdStatus(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('status: --id <questId> is required');
  const quest = loadQuest(root, id);
  const log = readLog(root, id);
  const state = projectState(quest, log);
  const status = {
    ...state,
    currentBlocker: buildCurrentBlocker({quest, log, state}),
    scopePressure: analyzeScopePressure(root, quest, log),
    advisories: questAdvisories(root, quest, log),
  };
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

function cmdReport(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('report: --id <questId> is required');
  const {file, md} = writeReport(root, id);
  const unrecorded = detectUnrecordedEvidence(root, id);
  const warning = unrecorded ?
    `\nWARNING: fresh probe evidence is not recorded. Run:\n  ${unrecorded.command}\n` :
    '';
  const advisories = questAdvisories(root, loadQuest(root, id));
  const advisoryText = advisories.length ?
    `\n${renderAdvisoryLines(advisories).join('\n')}\n` :
    '';
  process.stdout.write(`${md}${warning}${advisoryText}\n(written to ${file})\n`);
}

function cmdProbe(root, args) {
  const name = args.probe;
  if (!name) throw new Error('probe: --probe <name> is required');
  const probeArgs = {...args};
  delete probeArgs._;
  delete probeArgs.probe;
  const result = evaluate({probe: name, args: probeArgs}, {root});
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
  const regressionLabels = Array.isArray(args['regression-label']) ?
    args['regression-label'] :
    (typeof args['regression-label'] === 'string' ?
      [args['regression-label']] :
      []);
  const regressionClassification = typeof args['regression-resolution'] === 'string' ?
    {
      resolution: args['regression-resolution'],
      labels: regressionLabels,
      regressionEventIndex: args['regression-event'] !== undefined ?
        Number(args['regression-event']) :
        null,
      evidenceFingerprint: typeof args['regression-fingerprint'] === 'string' ?
        args['regression-fingerprint'] :
        null,
    } :
    null;
  const scopePressureClassification =
    typeof args['scope-pressure-resolution'] === 'string' ?
      {
        resolution: args['scope-pressure-resolution'],
        changeRef: typeof args['scope-pressure-change-ref'] === 'string' ?
          args['scope-pressure-change-ref'] :
          null,
      } :
      null;
  const stamped = appendFinding(root, id, {
    frontier: args.frontier,
    claim: args.claim,
    evidence: typeof args.evidence === 'string' ? args.evidence : null,
    rulesOut: typeof args.rulesOut === 'string' ? args.rulesOut : null,
    regressionClassification,
    scopePressureClassification,
  });
  process.stdout.write(`recorded finding for ${args.frontier} @ ${stamped.ts}\n`);
}

// Friendly aliases for the overridable guard codes so a driver can write `--guard theory`
// or `--guard scope` instead of the internal continuation code.
const OVERRIDE_GUARD_ALIASES = Object.freeze({
  'theory': CONTINUATION_BLOCKED_THEORY,
  'blocked-theory': CONTINUATION_BLOCKED_THEORY,
  'scope': CONTINUATION_BLOCKED_SCOPE,
  'blocked-scope': CONTINUATION_BLOCKED_SCOPE,
});

function cmdOverride(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('override: --id <questId> is required');
  if (!args.frontier) throw new Error('override: --frontier <frontierId> is required');
  const selector = typeof args.guard === 'string' ? args.guard :
    (typeof args.code === 'string' ? args.code : null);
  if (!selector) {
    throw new Error('override: --guard <theory|scope> (or --code <continuation-code>) ' +
      'is required');
  }
  const code = OVERRIDE_GUARD_ALIASES[selector] || selector;
  if (!continuationOverridable({status: code, code})) {
    throw new Error(`override: guard "${selector}" is not overridable. Only the heuristic ` +
      'theory and scope guards accept an override; honesty/integrity invariants ' +
      '(regression, unrecorded-evidence, metric-projection, measurement) do not.');
  }
  if (typeof args.reason !== 'string' || !args.reason.trim()) {
    throw new Error('override: --reason "<falsifiable justification>" is required');
  }
  loadQuest(root, id);
  const stamped = appendGuardOverride(root, id, {
    frontier: args.frontier,
    code,
    problem: typeof args.problem === 'string' ? args.problem : null,
    reason: args.reason,
  });
  process.stdout.write(
    `recorded override of ${code} for ${args.frontier} @ ${stamped.ts}\n` +
    '(authorizes one bypass of the next matching guard; reset by honest progress)\n');
}

function cmdReflect(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('reflect: --id <questId> is required');
  if (typeof args.note !== 'string' || !args.note.trim()) {
    throw new Error('reflect: --note "<free-form reframing>" is required');
  }
  loadQuest(root, id);
  const stamped = appendReflection(root, id, {
    frontier: typeof args.frontier === 'string' ? args.frontier : null,
    trigger: typeof args.trigger === 'string' ? args.trigger : 'manual',
    note: args.note,
  });
  process.stdout.write(`recorded reflection @ ${stamped.ts}\n`);
}
function cmdStep(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('step: --id <questId> is required');
  const quest = loadQuest(root, id);
  if (args.abort) {
    process.stdout.write(stepAbort(root, id) ?
      'pending step aborted\n' :
      'no pending step\n');
    return;
  }
  if (args.changeRef && !args.commit) {
    throw new Error('step commit requires --commit with --changeRef');
  }
  if (args.commit && !args.changeRef) {
    throw new Error('step --commit requires --changeRef diff:<path>');
  }
  const r = runStep(root, quest, {
    changeRef: typeof args.changeRef === 'string' ? args.changeRef : undefined,
    summary: typeof args.summary === 'string' ? args.summary : undefined,
    force: Boolean(args.force),
    push: args['no-push'] ? false : undefined,
    ...theoryCommitArgs(args),
  });
  if (r.terminal === 'theory-required' || r.terminal === 'blocked') {
    const header = r.terminal === 'theory-required' ?
      `THEORY REQUIRED — ${r.frontier} rung ${r.rungIndex}` :
      `BLOCKED (${r.disposition || 'recoverable'}) — ${r.frontier} ` +
      `rung ${r.rungIndex}`;
    const next = r.nextCommand ? `\nnext: ${r.nextCommand}` : '';
    process.stdout.write(
      `${header}\n` +
      `${(r.problems || []).map((problem) => `- ${problem}`).join('\n')}` +
      `${next}\n`);
    emitAdvisories(root, quest);
    return;
  }
  if (r.terminal === 'solved') {
    process.stdout.write(`SOLVED — evidence: ${r.evidence || '(none)'}\n`);
    return;
  }
  if (r.terminal === 'exhausted') {
    process.stdout.write('EXHAUSTED — no open frontier; human decision needed\n');
    return;
  }
  if (!args.changeRef) {
    process.stdout.write(
      `pinned ${r.frontier}: metric ${r.before.metric}\n` +
      `pending: ${r.pendingFile}\n` +
      `next: node scripts/solve.js step --id ${id} --commit ` +
      '--changeRef diff:<path> --summary "<what changed>"\n',
    );
    emitAdvisories(root, quest);
    return;
  }
  const moved = r.progressed ? 'PROGRESS' : 'flat';
  const viol = r.violations.length ? ` violations: ${r.violations.join('; ')}` : '';
  process.stdout.write(
    `recorded attempt on ${r.frontier}: metric ${r.before} -> ${r.after} ` +
    `(${moved})${r.done ? ' DONE' : ''}${viol}\n${commitLine(r.commit)}`);
  emitAdvisories(root, quest);
}

// One-line human summary of the auto commit+push outcome (R1), printed after a step.
function commitLine(commit) {
  if (!commit) return '';
  if (commit.committed) {
    const push = commit.pushed ? 'pushed' :
      (commit.pushError ? `push failed (commit kept): ${commit.pushError}` : 'not pushed');
    return `committed ${commit.paths.length} path(s), ${push}\n`;
  }
  return `no auto-commit (${commit.skipped})\n`;
}

function cmdTheory(root, args) {
  process.stdout.write(`${runTheoryCommand(root, args)}\n`);
}

function cmdHealth(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('health: --id <questId> is required');
  const quest = loadQuest(root, id);
  const health = analyzeQuestHealth(root, quest);
  const advisories = buildAdvisories(quest, health, readLog(root, id));
  if (args.json) {
    process.stdout.write(`${JSON.stringify({...health, advisories}, null, 2)}\n`);
  } else {
    process.stdout.write(renderHealth(health));
    if (advisories.length) {
      process.stdout.write(`\n${renderAdvisoryLines(advisories).join('\n')}\n`);
    }
  }
}

function cmdStepPending(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('step-pending: --id <questId> is required');
  process.stdout.write(`${JSON.stringify(stepPending(root, id), null, 2)}\n`);
}

function cmdIngestEvidence(root, args) {
  const id = args.id || args._[0];
  if (!id) throw new Error('ingest-evidence: --id <questId> is required');
  const frontier = args.frontier;
  if (!frontier) throw new Error('ingest-evidence: --frontier <frontierId> is required');
  const evidence = args.evidence;
  if (!evidence) throw new Error('ingest-evidence: --evidence <evidencePath> is required');

  const stamped = ingestEvidence(root, {
    questId: id,
    frontierId: frontier,
    evidencePath: evidence,
    probeScope: args.probe === 'doneWhen' ? 'doneWhen' : 'frontier',
  });
  process.stdout.write(`Ingested evidence: ${stamped.evidence} for ${frontier}\n`);
}

function cmdAttempt(root, args) {
  const result = runAttemptCommand(root, {
    ...args,
    ...theoryCommitArgs(args),
  });
  if (result && result.blocked) {
    const header = result.terminal === 'theory-required' ?
      `THEORY REQUIRED — ${result.frontier} rung ${result.rungIndex}` :
      `BLOCKED (${result.disposition || 'recoverable'}) — ` +
      `${result.frontier} rung ${result.rungIndex}`;
    const next = result.nextCommand ? `\nnext: ${result.nextCommand}` : '';
    process.stdout.write(
      `${header}\n` +
      `${(result.problems || []).map((problem) => `- ${problem}`).join('\n')}` +
      `${next}\n`);
    return;
  }
  process.stdout.write('Harness execution attempt complete and recorded.\n');
}

function cmdAudit(root, args) {
  const output = runAuditCommand(root, args);
  process.stdout.write(output);
}

function cmdUpgrade(root, args) {
  process.stdout.write(runUpgradeCommand(root, args));
}

function cmdReopen(root, args) {
  process.stdout.write(runReopenCommand(root, args));
}

// Portfolio is a cross-quest governance view and deliberately takes no --id.
function cmdPortfolio(root) {
  process.stdout.write(runPortfolioCommand(root));
}

// Frontier fuses the closure-ledger active records with the open quests into one
// boot-orientation screen; like portfolio it is cross-cutting and takes no --id.
function cmdFrontier(root) {
  process.stdout.write(runFrontierCommand(root));
}

function cmdHandoff(root, args) {
  process.stdout.write(runHandoffCommand(root, args));
}

const COMMANDS = {
  'new': cmdNew,
  'run': cmdRun,
  'status': cmdStatus,
  'report': cmdReport,
  'portfolio': cmdPortfolio,
  'frontier': cmdFrontier,
  'handoff': cmdHandoff,
  'probe': cmdProbe,
  'finding': cmdFinding,
  'override': cmdOverride,
  'reflect': cmdReflect,
  'step': cmdStep,
  'step-pending': cmdStepPending,
  'theory': cmdTheory,
  'health': cmdHealth,
  'ingest-evidence': cmdIngestEvidence,
  'attempt': cmdAttempt,
  'audit': cmdAudit,
  'upgrade': cmdUpgrade,
  'reopen': cmdReopen,
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
  let args;
  if (command === 'attempt') {
    const dashDashIndex = process.argv.indexOf('--');
    if (dashDashIndex !== -1) {
      const commandArgs = process.argv.slice(3, dashDashIndex);
      const harnessCmd = process.argv.slice(dashDashIndex + 1);
      args = parseArgs(commandArgs);
      args._ = harnessCmd;
    } else {
      args = parseArgs(rest);
    }
  } else {
    args = parseArgs(rest);
  }
  const root = args.root || process.cwd();
  try {
    handler(root, args);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(1);
  }
}

main();
