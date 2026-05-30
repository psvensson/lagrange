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

const JAR_PATH = process.env.TLA_TOOLS_JAR ||
  path.resolve('tools', 'tla2tools.jar');
const JAR_URL =
  'https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar';
const MODULE = path.resolve('models', 'active-gate', 'ActiveGate.tla');
const REPORTS_DIR = path.resolve('test-output', 'reports');
const META_ROOT = path.resolve('test-output', 'tlc');

const CONFIGS = [
  {
    mode: 'route',
    cfg: path.resolve('models', 'active-gate', 'ActiveGate_route.cfg'),
    expectConverged: true,
    report: 'active-gate-tlc-route.model.report.json',
  },
  {
    mode: 'stall',
    cfg: path.resolve('models', 'active-gate', 'ActiveGate_stall.cfg'),
    expectConverged: false,
    report: 'active-gate-tlc-stall.model.report.json',
  },
];

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
  const metadir = path.join(META_ROOT, config.mode);
  fs.mkdirSync(metadir, {recursive: true});
  const result = spawnSync('java', [
    '-cp', JAR_PATH,
    'tlc2.TLC',
    '-deadlock',
    '-metadir', metadir,
    '-config', config.cfg,
    MODULE,
  ], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  return {exitCode: result.status, output};
}

function cleanTraceArtifacts() {
  const dir = path.dirname(MODULE);
  for (const entry of fs.readdirSync(dir)) {
    if (/_TTrace_.*\.(tla|bin)$/.test(entry)) {
      fs.rmSync(path.join(dir, entry), {force: true});
    }
  }
}

function interpret(config, run) {
  const noError = /No error has been found/.test(run.output);
  const temporalViolated = /Temporal properties were violated/.test(run.output);
  const converged = noError && !temporalViolated;
  const livenessHolds = converged;
  const expectationMet = converged === config.expectConverged;
  return {converged, temporalViolated, livenessHolds, expectationMet};
}

function buildTlcReport(config, run, verdict) {
  const tail = run.output.trim().split('\n').slice(-12).join('\n');
  return {
    schemaVersion: 'active-gate-model-report-v1',
    modelReport: true,
    source: 'tlc',
    mode: config.mode,
    scenario: 'rolling-restart-active-gate-convergence',
    owner: 'active_gate_owner',
    boundary: 'snapshot_coverage',
    converged: verdict.converged,
    residual: verdict.converged ? 0 : 1,
    frontierCount: verdict.converged ? 0 : 1,
    livenessHolds: verdict.livenessHolds,
    expectConverged: config.expectConverged,
    expectationMet: verdict.expectationMet,
    temporalViolated: verdict.temporalViolated,
    exitCode: run.exitCode,
    outputTail: tail,
  };
}

async function main() {
  await ensureJar();
  fs.mkdirSync(REPORTS_DIR, {recursive: true});

  let allMet = true;
  for (const config of CONFIGS) {
    const run = runTlc(config);
    cleanTraceArtifacts();
    const verdict = interpret(config, run);
    const report = buildTlcReport(config, run, verdict);
    const target = path.join(REPORTS_DIR, config.report);
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    const rel = path.relative(process.cwd(), target);
    console.log(
      `  ${config.mode}: converged=${verdict.converged} ` +
      `expect=${config.expectConverged} met=${verdict.expectationMet} -> ${rel}`,
    );
    if (!verdict.expectationMet) allMet = false;
  }

  if (!allMet) {
    console.error('TLC expectations not met (route must hold, stall must fail).');
    process.exit(1);
  }
  console.log('TLC confirms route converges and stall oscillates as expected.');
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
