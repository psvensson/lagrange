// Generic, model-/CLI-agnostic agent executor.
//
// The solver never depends on any specific agent, CLI or model. It shells out to an
// arbitrary configured command and communicates over the filesystem, so ANY worker
// (a CLI, a model-API wrapper, a shell script, a remote runner) can satisfy the
// contract by conforming to one I/O shape:
//
//   config  solve/config.json: { agentCommand: "<argv template>", timeoutMs: N }
//           {requestFile}/{responseFile} are interpolated into the template and also
//           exported as SOLVE_REQUEST_FILE / SOLVE_RESPONSE_FILE.
//   request (solver -> agent)  JSON dossier: questId, statement, frontier, rung,
//           rungPrompt, repoRoot, metricName, metricHistory[], evidencePaths[],
//           findings[], constraints.
//   response (agent -> solver) JSON: { changeRef, summary, notes? }. The agent reports
//           only WHAT IT DID, never whether it succeeded.
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

export function configFilePath(root) {
  return path.join(root, SOLVE_DATA_DIR, CONFIG_FILE);
}

export function loadAgentConfig(root) {
  const file = configFilePath(root);
  if (!fs.existsSync(file)) {
    throw new Error(
      `agent executor needs ${file} ({ "agentCommand": "...", "timeoutMs": N })`);
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof config.agentCommand !== 'string' || !config.agentCommand.trim()) {
    throw new Error(`${file}: "agentCommand" (string) is required`);
  }
  return config;
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
    }),
    repoRoot,
    metricName,
    metricHistory,
    evidencePaths,
    findings,
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
      notes: parsed.notes || null};
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
  };
}
