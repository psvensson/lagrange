#!/usr/bin/env node

// Phase B runner. Drives TLC over the ActiveGate TLA+ spec in both
// configurations and emits *.model.report.json evidence artifacts alongside
// the fast-check reports, so the Phase C summarizer treats both checkers
// uniformly.
//
// Inverted expectations:
//   route config -> EventuallyConverged must HOLD  (TLC exit 0).
//   stall config -> EventuallyConverged must FAIL  (TLC reports the
//                   oscillation as a liveness counterexample, exit != 0).
// The script exits 0 only when both expectations are met. TLC is fetched on
// demand if tools/tla2tools.jar is absent (override with TLA_TOOLS_JAR).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import https from 'node:https';
import {pathToFileURL} from 'node:url';
import {CONFIGS} from './model-tlc-configs.js';
import {TLC_NO_ERROR_VERDICT} from './model-tlc-constants.js';
import {deterministicTlcOutputTail} from './model-tlc-output-tail.js';

const JAR_PATH = process.env.TLA_TOOLS_JAR ||
  path.resolve('tools', 'tla2tools.jar');
const JAR_URL =
  'https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar';
const REPORTS_DIR = path.resolve('test-output', 'reports');
const META_ROOT = path.resolve('test-output', 'tlc');
const CONTRACT_EVIDENCE_DIR =
  path.resolve('architecture', 'contracts', 'evidence');
const MODE_ARGUMENT = '--mode';
const DUPLICATE_MODE_PROBLEM =
  'model-tlc: --mode may be provided exactly once';
const MISSING_MODE_PROBLEM =
  'model-tlc: --mode requires one registered mode value';
const UNEXPECTED_ARGUMENT_PREFIX = 'model-tlc: unexpected argument: ';
const UNKNOWN_MODE_PREFIX = 'model-tlc: unknown registered mode: ';
const OPTION_PREFIX = '--';

function modeArgumentIndexes(argv) {
  const indexes = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === MODE_ARGUMENT) indexes.push(index);
  }
  return indexes;
}

function selectedModeValue(argv, modeIndex) {
  const mode = argv[modeIndex + 1];
  if (typeof mode !== 'string' || mode.length === 0 ||
      mode.startsWith(OPTION_PREFIX)) {
    throw new Error(MISSING_MODE_PROBLEM);
  }
  return mode;
}

export function selectTlcConfigs(argv, configs = CONFIGS) {
  const modeIndexes = modeArgumentIndexes(argv);
  if (modeIndexes.length === 0) {
    if (argv.length > 0) {
      throw new Error(`${UNEXPECTED_ARGUMENT_PREFIX}${argv[0]}`);
    }
    return configs;
  }
  if (modeIndexes.length > 1) throw new Error(DUPLICATE_MODE_PROBLEM);

  const modeIndex = modeIndexes[0];
  const mode = selectedModeValue(argv, modeIndex);
  if (modeIndex !== 0 || argv.length !== 2) {
    const unexpected = modeIndex === 0 ? argv[2] : argv[0];
    throw new Error(`${UNEXPECTED_ARGUMENT_PREFIX}${unexpected}`);
  }

  const selected = configs.filter((config) => config.mode === mode);
  if (selected.length !== 1) {
    throw new Error(`${UNKNOWN_MODE_PREFIX}${mode}`);
  }
  return selected;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (target, redirects) => {
      if (redirects > 5) {
        reject(new Error('too many redirects fetching tla2tools.jar'));
        return;
      }
      https.get(target, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          request(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`unexpected status ${res.statusCode} fetching jar`));
          return;
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    };
    request(url, 0);
  });
}

async function ensureJar() {
  if (fs.existsSync(JAR_PATH)) return;
  fs.mkdirSync(path.dirname(JAR_PATH), {recursive: true});
  process.stderr.write(`Fetching tla2tools.jar -> ${JAR_PATH}\n`);
  await download(JAR_URL, JAR_PATH);
}

function runTlc(config) {
  const metadir = path.join(META_ROOT, config.id || config.mode);
  fs.mkdirSync(metadir, {recursive: true});
  const result = spawnSync('java', [
    '-cp', JAR_PATH,
    'tlc2.TLC',
    '-deadlock',
    '-metadir', metadir,
    '-config', config.cfg,
    config.module,
  ], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  return {exitCode: result.status, output};
}

function cleanTraceArtifacts(modulePath) {
  const dir = path.dirname(modulePath);
  for (const entry of fs.readdirSync(dir)) {
    if (/_TTrace_.*\.(tla|bin)$/.test(entry)) {
      fs.rmSync(path.join(dir, entry), {force: true});
    }
  }
}

function interpret(config, run) {
  const noError = run.output.includes(TLC_NO_ERROR_VERDICT);
  const temporalViolated =
    /Temporal propert(?:y|ies)\b[\s\S]*violated/iu.test(run.output);
  const expectedFailureObserved = !config.expectConverged &&
    typeof config.expectedFailurePattern === 'string' &&
    run.output.includes(config.expectedFailurePattern);
  const converged = noError && !temporalViolated;
  const livenessHolds = converged;
  const expectationMet = config.expectConverged ?
    converged :
    !converged && expectedFailureObserved;
  return {
    converged,
    expectedFailureObserved,
    temporalViolated,
    livenessHolds,
    expectationMet,
  };
}

function buildTlcReport(config, run, verdict) {
  return {
    schemaVersion: 'active-gate-model-report-v1',
    modelReport: true,
    source: 'tlc',
    mode: config.mode,
    scenario: config.scenario,
    owner: config.owner,
    boundary: config.boundary,
    module: path.relative(process.cwd(), config.module),
    config: path.relative(process.cwd(), config.cfg),
    converged: verdict.converged,
    residual: verdict.converged ? 0 : 1,
    frontierCount: verdict.converged ? 0 : 1,
    livenessHolds: verdict.livenessHolds,
    expectConverged: config.expectConverged,
    expectedFailurePattern: config.expectedFailurePattern || null,
    expectedFailureObserved: verdict.expectedFailureObserved,
    expectationMet: verdict.expectationMet,
    temporalViolated: verdict.temporalViolated,
    exitCode: run.exitCode,
    outputTail: deterministicTlcOutputTail(run.output, verdict.converged),
  };
}

// The single report-rendering surface: one TLC run in, the complete report
// object out. Two runs with the same model outcome render byte-identical
// JSON (the tail owner strips every run-dependent line), which is what keeps
// the versioned evidence copies stable across re-runs.
export function renderTlcReport(config, run) {
  const verdict = interpret(config, run);
  return {verdict, report: buildTlcReport(config, run, verdict)};
}

async function main(argv = process.argv.slice(2)) {
  const selectedConfigs = selectTlcConfigs(argv);
  await ensureJar();
  fs.mkdirSync(REPORTS_DIR, {recursive: true});

  let allMet = true;
  for (const config of selectedConfigs) {
    const run = runTlc(config);
    cleanTraceArtifacts(config.module);
    const {verdict, report} = renderTlcReport(config, run);
    const target = path.join(REPORTS_DIR, config.report);
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    // Contract records cite versioned evidence copies (system-contract
    // validation requires them in fresh checkouts); refresh any that exist
    // so a re-run can never leave stale evidence behind.
    const evidenceTarget = path.join(CONTRACT_EVIDENCE_DIR, config.report);
    if (fs.existsSync(evidenceTarget)) {
      fs.writeFileSync(evidenceTarget, `${JSON.stringify(report, null, 2)}\n`);
    }
    const rel = path.relative(process.cwd(), target);
    console.log(
      `  ${config.mode}: converged=${verdict.converged} ` +
      `expect=${config.expectConverged} met=${verdict.expectationMet} -> ${rel}`,
    );
    if (!verdict.expectationMet) allMet = false;
  }

  if (!allMet) {
    console.error('TLC expectations not met.');
    process.exit(1);
  }
  console.log('TLC confirms expected route and forbidden-shape outcomes.');
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isDirectRun()) {
  main().catch((err) => {
    console.error(err.stack || String(err));
    process.exit(1);
  });
}
