// Generic, model-/CLI-agnostic agent executor.
//
// The solver never depends on any specific agent, CLI or model. It shells out to an
// arbitrary configured command and communicates over the filesystem, so ANY worker
// (a CLI, a model-API wrapper, a shell script, a remote runner) can satisfy the
// contract by conforming to one I/O shape:
//
//   config  solve/config.json: { enabled: true, agentCommand: "<argv template>",
//           timeoutMs: N }
//           {requestFile}/{responseFile} are interpolated into the template and also
//           exported as SOLVE_REQUEST_FILE / SOLVE_RESPONSE_FILE.
//   request (solver -> agent)  JSON dossier: questId, statement, frontier, rung,
//           rungPrompt, repoRoot, metricName, metricHistory[], evidencePaths[],
//           findings[], constraints.
//   response (agent -> solver) JSON: { changeRef, summary, notes? }. The agent reports
//           only WHAT IT DID, never whether it succeeded. Theory/model refs may be
//           included to bind the attempt to the selected reasoning path. On the observe
//           rung the agent may set discrimination: "confirmed" | "refuted" to report
//           that it instrumented the frontier and ran the selected theory's
//           discriminator; a confirmed/refuted result earns investigative progress.
//
// Truth comes from the probe, not the agent: after the command returns (or the
// per-attempt timeout elapses → treated as a no-op attempt), the loop re-measures, so
// a dishonest or failed adapter simply shows no metric movement and the rung escalates.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

import {SOLVE_DATA_DIR, CONFIG_FILE} from './constants.js';
import {rungPrompt} from './ladder.js';

const DEFAULT_TIMEOUT_MS = 600000;
const REQUEST_PLACEHOLDER = '{requestFile}';
const RESPONSE_PLACEHOLDER = '{responseFile}';
const EXAMPLE_ADAPTER = 'scripts/solve/agent-adapter.example.sh';
const CONFIG_STATE = Object.freeze({
  ABSENT: 'absent',
  MALFORMED: 'malformed',
  DISABLED: 'disabled',
  ENABLED: 'enabled',
});

export function configFilePath(root) {
  return path.join(root, SOLVE_DATA_DIR, CONFIG_FILE);
}

function executablePath(root, command) {
  const executable = command.trim().split(/\s+/u)[0];
  if (!executable) return null;
  if (executable.includes('/') || executable.includes(path.sep)) {
    return path.isAbsolute(executable) ? executable : path.resolve(root, executable);
  }
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, executable);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }
  return null;
}

function executableReady(file) {
  if (!file) return false;
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function usesExampleAdapter(root, command) {
  const executable = command.trim().split(/\s+/u)[0] || '';
  const resolved = path.isAbsolute(executable) ? executable : path.resolve(root, executable);
  return executable === EXAMPLE_ADAPTER ||
    resolved === path.resolve(root, EXAMPLE_ADAPTER);
}

// Read-only capability inspection shared by `solve doctor` and the live executor.
// It never creates a config, probes the adapter by running it, or changes the worktree.
export function inspectAgentConfig(root) {
  const file = configFilePath(root);
  if (!fs.existsSync(file)) {
    return {
      state: CONFIG_STATE.ABSENT,
      enabled: false,
      available: false,
      command: null,
      executable: null,
      issues: ['solve/config.json is absent'],
      config: null,
    };
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {
      state: CONFIG_STATE.MALFORMED,
      enabled: false,
      available: false,
      command: null,
      executable: null,
      issues: ['solve/config.json is not valid JSON'],
      config: null,
    };
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {
      state: CONFIG_STATE.MALFORMED,
      enabled: false,
      available: false,
      command: null,
      executable: null,
      issues: ['solve/config.json must contain a JSON object'],
      config: null,
    };
  }

  const command = typeof config.agentCommand === 'string' && config.agentCommand.trim() ?
    config.agentCommand.trim() : null;
  if (config.enabled !== true) {
    return {
      state: CONFIG_STATE.DISABLED,
      enabled: false,
      available: false,
      command,
      executable: command ? executablePath(root, command) : null,
      issues: ['agent executor is disabled; set "enabled": true only for a live adapter'],
      config,
    };
  }

  const issues = [];
  const executable = command ? executablePath(root, command) : null;
  if (!command) issues.push('"agentCommand" (string) is required');
  if (command && usesExampleAdapter(root, command)) {
    issues.push(`${EXAMPLE_ADAPTER} is a no-op reference adapter`);
  }
  if (command && !executableReady(executable)) {
    issues.push('agentCommand executable is missing or not executable');
  }
  if (config.timeoutMs !== undefined &&
    (!Number.isFinite(Number(config.timeoutMs)) || Number(config.timeoutMs) <= 0)) {
    issues.push('"timeoutMs" must be a positive number when provided');
  }
  return {
    state: CONFIG_STATE.ENABLED,
    enabled: true,
    available: issues.length === 0,
    command,
    executable,
    issues,
    config,
  };
}

export function loadAgentConfig(root) {
  const inspected = inspectAgentConfig(root);
  if (!inspected.available) {
    throw new Error(
      `agent executor unavailable: ${inspected.issues.join('; ')}; ` +
      'run `node scripts/solve.js doctor` for supervised-mode guidance');
  }
  return inspected.config;
}

function metricNameOf(frontierDef) {
  return frontierDef.metric?.args?.metric || frontierDef.metric?.probe || 'metric';
}

function buildDossier(task, repoRoot) {
  const findings = task.frontierState?.findings || [];
  const metricName = metricNameOf(task.frontierDef);
  const metricHistory = Array.isArray(task.metricHistory) ? task.metricHistory : [];
  const evidencePaths = Array.isArray(task.evidencePaths) ? task.evidencePaths : [];
  return {
    questId: task.quest.id,
    statement: task.quest.statement,
    frontier: task.frontierDef.id,
    rung: task.rung,
    rungIndex: task.rungIndex,
    rungPrompt: rungPrompt({
      quest: task.quest,
      frontierDef: task.frontierDef,
      metricName,
      rungIndex: task.rungIndex,
      metricHistory,
      findings,
      selectedTheory:
        task.theories?.byId?.[
          task.theories?.selectedByFrontier?.[task.frontierDef.id]
        ] || null,
    }),
    repoRoot,
    metricName,
    metricHistory,
    evidencePaths,
    findings,
    selectedTheory:
      task.theories?.selectedByFrontier?.[task.frontierDef.id] || null,
    constraints: task.quest.constraints || [],
  };
}

// Split an argv template into argv, interpolating the request/response file paths.
// Whitespace-delimited; quoting is intentionally not supported to keep the contract
// trivial — point agentCommand at a wrapper script if you need complex arguments.
function buildArgv(template, requestFile, responseFile) {
  return template.trim().split(/\s+/).map((tok) => tok
    .replace(REQUEST_PLACEHOLDER, requestFile)
    .replace(RESPONSE_PLACEHOLDER, responseFile));
}

function readResponse(responseFile) {
  if (!fs.existsSync(responseFile)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(responseFile, 'utf8'));
    if (!parsed || typeof parsed.changeRef !== 'string') return null;
    return {changeRef: parsed.changeRef, summary: parsed.summary || null,
      notes: parsed.notes || null,
      theoryRef: parsed.theoryRef || null,
      expectedMovement: parsed.expectedMovement || null,
      negativeResultMeans: parsed.negativeResultMeans || null,
      modelRef: parsed.modelRef || null,
      modelNotApplicable: parsed.modelNotApplicable || null,
      discrimination: parsed.discrimination || null};
  } catch (_error) {
    return null;
  }
}

// Read a reflection response: a single free-form note. Tolerant of either {reflection} or
// {note}; anything else (missing/malformed) is treated as "no note" — the reflection event
// is still recorded so the cadence resets, it simply carries no text.
function readReflectionResponse(responseFile) {
  if (!fs.existsSync(responseFile)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(responseFile, 'utf8'));
    if (!parsed) return null;
    const note = typeof parsed.reflection === 'string' ? parsed.reflection :
      (typeof parsed.note === 'string' ? parsed.note : null);
    return {reflection: note};
  } catch (_error) {
    return null;
  }
}

// A failed/timed-out/malformed agent run is a no-op attempt: a null changeRef means the
// honesty check rejects any claimed metric movement, so the rung escalates honestly.
function noop(reason) {
  return {changeRef: null, summary: `agent no-op: ${reason}`};
}

export function makeAgentExecutor(root, options = {}) {
  const config = options.config || loadAgentConfig(root);
  const timeoutMs = Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const repoRoot = options.repoRoot || root;
  const run = options.spawn || spawnSync;
  return {
    name: 'agent',
    run(task) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-agent-'));
      const requestFile = path.join(dir, 'request.json');
      const responseFile = path.join(dir, 'response.json');
      fs.writeFileSync(requestFile, JSON.stringify(buildDossier(task, repoRoot), null, 2));
      const [cmd, ...args] = buildArgv(config.agentCommand, requestFile, responseFile);
      const result = run(cmd, args, {
        cwd: repoRoot,
        timeout: timeoutMs,
        env: {...process.env,
          SOLVE_REQUEST_FILE: requestFile, SOLVE_RESPONSE_FILE: responseFile},
        encoding: 'utf8',
      });
      if (result.error && result.error.code === 'ETIMEDOUT') {
        return noop(`timeout after ${timeoutMs}ms`);
      }
      if (result.status !== 0) {
        return noop(`exit ${result.status === null ? 'signal' : result.status}`);
      }
      return readResponse(responseFile) || noop('no valid response file');
    },
    // Step-back reflection turn over the same generic file contract: the request carries
    // kind: "reflection" plus the reflection prompt and a compact health snapshot; the agent
    // replies with { reflection: "<free-form reframing>" }. A failed/timed-out/malformed run
    // simply yields no note (the loop still records the reflection so the cadence resets).
    reflect(task) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-reflect-'));
      const requestFile = path.join(dir, 'request.json');
      const responseFile = path.join(dir, 'response.json');
      fs.writeFileSync(requestFile, JSON.stringify({
        kind: 'reflection',
        reflectionKind: task.kind === 'altitude' ? 'altitude' : 'micro',
        questId: task.quest?.id || null,
        statement: task.quest?.statement || null,
        frontier: task.health?.frontier || null,
        trigger: task.trigger || null,
        prompt: task.prompt || null,
        signals: task.health?.signals || [],
        nextAction: task.health?.nextAction || null,
        repoRoot,
      }, null, 2));
      const [cmd, ...args] = buildArgv(config.agentCommand, requestFile, responseFile);
      const result = run(cmd, args, {
        cwd: repoRoot,
        timeout: timeoutMs,
        env: {...process.env,
          SOLVE_REQUEST_FILE: requestFile, SOLVE_RESPONSE_FILE: responseFile},
        encoding: 'utf8',
      });
      if ((result.error && result.error.code === 'ETIMEDOUT') ||
        result.status !== 0) {
        return {reflection: null};
      }
      return readReflectionResponse(responseFile) || {reflection: null};
    },
  };
}
