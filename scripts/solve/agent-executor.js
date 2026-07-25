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

const LOCAL_STR_OWNED_001 = '/';
const LOCAL_STR_OWNED_002 = 'solve/config.json is absent';
const LOCAL_STR_OWNED_003 = 'utf8';
const LOCAL_STR_OWNED_004 = 'solve/config.json is not valid JSON';
const LOCAL_STR_OWNED_005 = 'solve/config.json must contain a JSON object';
const LOCAL_STR_OWNED_006 = 'agent executor is disabled; set "enabled": true only for a live adapter';
const LOCAL_STR_OWNED_007 = '"agentCommand" (string) is required';
const LOCAL_STR_OWNED_008 = 'agentCommand executable is missing or not executable';
const LOCAL_STR_OWNED_009 = '"timeoutMs" must be a positive number when provided';
const LOCAL_STR_OWNED_010 = '; ';
const LOCAL_STR_OWNED_011 = 'run `node scripts/solve.js doctor` for supervised-mode guidance';

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
  if (executable.includes(LOCAL_STR_OWNED_001) || executable.includes(path.sep)) {
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

function buildAgentInspection({
  state,
  enabled,
  available,
  command,
  executable,
  issues,
  config,
}) {
  return {
    state,
    enabled,
    available,
    command,
    executable,
    issues,
    config,
  };
}

// Read-only capability inspection shared by `solve doctor` and the live executor.
// It never creates a config, probes the adapter by running it, or changes the worktree.
export function inspectAgentConfig(root) {
  const file = configFilePath(root);
  if (!fs.existsSync(file)) {
    return buildAgentInspection({
      state: CONFIG_STATE.ABSENT,
      enabled: false,
      available: false,
      command: null,
      executable: null,
      issues: [LOCAL_STR_OWNED_002],
      config: null,
    });
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, LOCAL_STR_OWNED_003));
  } catch {
    return buildAgentInspection({
      state: CONFIG_STATE.MALFORMED,
      enabled: false,
      available: false,
      command: null,
      executable: null,
      issues: [LOCAL_STR_OWNED_004],
      config: null,
    });
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return buildAgentInspection({
      state: CONFIG_STATE.MALFORMED,
      enabled: false,
      available: false,
      command: null,
      executable: null,
      issues: [LOCAL_STR_OWNED_005],
      config: null,
    });
  }

  const command = typeof config.agentCommand === 'string' && config.agentCommand.trim() ?
    config.agentCommand.trim() : null;
  if (config.enabled !== true) {
    return buildAgentInspection({
      state: CONFIG_STATE.DISABLED,
      enabled: false,
      available: false,
      command,
      executable: command ? executablePath(root, command) : null,
      issues: [LOCAL_STR_OWNED_006],
      config,
    });
  }

  const issues = [];
  const executable = command ? executablePath(root, command) : null;
  if (!command) issues.push(LOCAL_STR_OWNED_007);
  if (command && usesExampleAdapter(root, command)) {
    issues.push(`${EXAMPLE_ADAPTER} is a no-op reference adapter`);
  }
  if (command && !executableReady(executable)) {
    issues.push(LOCAL_STR_OWNED_008);
  }
  if (config.timeoutMs !== undefined &&
    (!Number.isFinite(Number(config.timeoutMs)) || Number(config.timeoutMs) <= 0)) {
    issues.push(LOCAL_STR_OWNED_009);
  }
  return buildAgentInspection({
    state: CONFIG_STATE.ENABLED,
    enabled: true,
    available: issues.length === 0,
    command,
    executable,
    issues,
    config,
  });
}

export function loadAgentConfig(root) {
  const inspected = inspectAgentConfig(root);
  if (!inspected.available) {
    throw new Error(
      `agent executor unavailable: ${inspected.issues.join(LOCAL_STR_OWNED_010)}; ` +
      LOCAL_STR_OWNED_011);
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

// Provider-neutral cost of one attempt, measured by the Solver rather than
// self-reported by the adapter.
//
// Deliberately NOT tokens or dollars: the Solver never depends on a specific agent,
// CLI or model (see the module header), so a token count would either bind it to one
// provider or take an adapter's unverifiable word for it. Bytes and milliseconds are
// measurable here and mean the same thing for every adapter.
//
// DESCRIPTIVE ONLY. Nothing in the ladder, the gates or the honesty checks may read
// this — an attempt is judged by its probe, never by how long it took or how much
// context it was handed. `findingsBytes`/`findingsCount` exist to size the dossier
// budget against measured reality instead of an offline reconstruction of it.
function attemptTelemetry(dossier, serialized, startedAt) {
  const findings = Array.isArray(dossier.findings) ? dossier.findings : [];
  return {
    dossierBytes: Buffer.byteLength(serialized, LOCAL_STR_OWNED_003),
    findingsBytes: Buffer.byteLength(
      JSON.stringify(findings), LOCAL_STR_OWNED_003),
    findingsCount: findings.length,
    agentDurationMs: Date.now() - startedAt,
  };
}

// A failed/timed-out/malformed agent run is a no-op attempt: a null changeRef means the
// honesty check rejects any claimed metric movement, so the rung escalates honestly.
//
// A no-op still carries its telemetry. The timeout path is precisely where duration
// matters most — it is the only signal that a per-attempt budget is being burned
// wholesale — so dropping telemetry here would blind the measurement exactly where it
// is most needed.
function noop(reason, telemetry = null) {
  return {changeRef: null, summary: `agent no-op: ${reason}`, telemetry};
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
      const dossier = buildDossier(task, repoRoot);
      // Serialize once into a named local so the bytes the agent actually receives
      // are the bytes measured — a reconstructed estimate drifts from reality, which
      // is how the first attempt at sizing this was wrong by 2x.
      const serialized = JSON.stringify(dossier, null, 2);
      fs.writeFileSync(requestFile, serialized);
      const [cmd, ...args] = buildArgv(config.agentCommand, requestFile, responseFile);
      const startedAt = Date.now();
      const result = run(cmd, args, {
        cwd: repoRoot,
        timeout: timeoutMs,
        env: {...process.env,
          SOLVE_REQUEST_FILE: requestFile, SOLVE_RESPONSE_FILE: responseFile},
        encoding: 'utf8',
      });
      const telemetry = attemptTelemetry(dossier, serialized, startedAt);
      if (result.error && result.error.code === 'ETIMEDOUT') {
        return noop(`timeout after ${timeoutMs}ms`, telemetry);
      }
      if (result.status !== 0) {
        return noop(`exit ${result.status === null ? 'signal' : result.status}`,
          telemetry);
      }
      const response = readResponse(responseFile);
      return response ?
        {...response, telemetry} :
        noop('no valid response file', telemetry);
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
