import {spawnSync} from 'node:child_process';

import {inspectAgentConfig} from './agent-executor.js';
import {inspectCoauthorAttribution} from './operator-config.js';

const LOCAL_STR_OWNED_001 = 'true';
const LOCAL_STR_OWNED_002 = 'autonomous';
const LOCAL_STR_OWNED_003 = 'supervised';
const LOCAL_STR_OWNED_004 = 'solve/config.json';
const LOCAL_STR_OWNED_005 = 'node scripts/solve.js run --id <quest> --executor agent --yes --keep-alive';
const LOCAL_STR_OWNED_006 = 'node scripts/solve.js next --id <quest>';

const DOCTOR_SCHEMA_VERSION = 1;
const LINE_SEPARATOR = '\n';

function gitOutput(root, args, spawn) {
  const result = spawn('git', args, {cwd: root, encoding: 'utf8'});
  return {
    ok: result.status === 0,
    value: result.status === 0 && typeof result.stdout === 'string' ?
      result.stdout.trim() : null,
  };
}

function inspectGit(root, spawn) {
  const inside = gitOutput(root, ['rev-parse', '--is-inside-work-tree'], spawn);
  if (!inside.ok || inside.value !== LOCAL_STR_OWNED_001) {
    return {
      available: false,
      insideWorkTree: false,
      branch: null,
      dirty: null,
      changedPathCount: null,
    };
  }
  const branch = gitOutput(root, ['branch', '--show-current'], spawn);
  const status = gitOutput(root, ['status', '--porcelain', '-uall'], spawn);
  const changedPathCount = status.ok && status.value ?
    status.value.split(LINE_SEPARATOR).filter(Boolean).length : 0;
  return {
    available: true,
    insideWorkTree: true,
    branch: branch.value || null,
    dirty: status.ok ? changedPathCount > 0 : null,
    changedPathCount: status.ok ? changedPathCount : null,
  };
}

// Flags an adapter that looks like it resumes a session.
//
// The executor contract is one fresh spawn per attempt: state reaches the agent as a
// dossier rebuilt from the durable log, not as an accumulating conversation. That is
// what keeps a long unattended run from filling one agent's context, and it is what
// the dossier budget is sized against. But agentCommand is an arbitrary argv template
// — nothing stops it resuming a session, and if it does, context accumulates silently
// and the Solver cannot tell. Advisory, not a gate: some wrapper may legitimately
// carry one of these words, and a false positive must not block an operator.
const SESSION_RESUMING_FLAGS = Object.freeze([
  '--resume', '--continue', '--session', '--thread',
]);

const SESSION_FLAG_JOIN = ', ';
const SESSION_WARNING_TAIL =
  ': the executor contract is one fresh agent per attempt, and a resumed session ' +
  'accumulates context the Solver cannot see or bound. Confirm the adapter starts ' +
  'clean each invocation.';

export function adapterSessionWarning(command) {
  if (typeof command !== 'string' || !command) return null;
  const found = SESSION_RESUMING_FLAGS.filter((flag) => command.includes(flag));
  if (found.length === 0) return null;
  return `agentCommand contains ${found.join(SESSION_FLAG_JOIN)}` +
    SESSION_WARNING_TAIL;
}

export function buildDoctorReport(root, options = {}) {
  const spawn = options.spawn || spawnSync;
  const env = options.env || process.env;
  const agent = inspectAgentConfig(root);
  const git = inspectGit(root, spawn);
  const attribution = inspectCoauthorAttribution(root, env);
  const autonomous = agent.available;
  return {
    schemaVersion: DOCTOR_SCHEMA_VERSION,
    ok: git.insideWorkTree,
    recommendedMode: autonomous ? LOCAL_STR_OWNED_002 : LOCAL_STR_OWNED_003,
    agentExecutor: {
      configPath: LOCAL_STR_OWNED_004,
      state: agent.state,
      enabled: agent.enabled,
      available: agent.available,
      command: agent.command,
      executable: agent.executable,
      issues: agent.issues,
      sessionWarning: adapterSessionWarning(agent.command),
    },
    git,
    attribution,
    next: autonomous ?
      LOCAL_STR_OWNED_005 :
      LOCAL_STR_OWNED_006,
  };
}

export function renderDoctor(report) {
  const agentState = report.agentExecutor.available ? 'available' :
    `${report.agentExecutor.state} (${report.agentExecutor.issues.join('; ')})`;
  const gitState = report.git.insideWorkTree ?
    `${report.git.branch || 'detached HEAD'}, ${report.git.dirty ? 'dirty' : 'clean'}` :
    'not a Git worktree';
  const attribution = report.attribution.trailer ?
    `${report.attribution.source}: ${report.attribution.trailer}` :
    (report.attribution.issue || 'none (commit messages omit a co-author trailer)');
  const lines = [
    `mode: ${report.recommendedMode}`,
    `agent executor: ${agentState}`,
  ];
  if (report.agentExecutor.sessionWarning) {
    lines.push(`  warning: ${report.agentExecutor.sessionWarning}`);
  }
  lines.push(
    `git: ${gitState}`,
    `attribution: ${attribution}`,
    `next: ${report.next}`,
  );
  return lines.join(LINE_SEPARATOR) + LINE_SEPARATOR;
}
