#!/usr/bin/env node

// Oracle writer for the complexity-ratchet-closure-wave1 Quest.
//
// Runs both complexity ratchets and writes a deterministic oracle whose metric
// is the total excess over the two baselines — 0 exactly when both ratchets
// pass. The oracle never edits a baseline: closure means reducing real
// violations, and a baseline change would show up here as an unexplained jump
// in the recorded ceiling, not as progress.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ORACLE_PATH = 'solve/oracle/complexity-ratchet-closure-wave1.json';
const RATCHETS = Object.freeze([
  {
    key: 'cognitive',
    command: ['scripts/check-cognitive-complexity.js'],
    report: 'test-output/analysis/cognitive-complexity-src-scripts.json',
  },
  {
    key: 'cyclomatic',
    command: ['scripts/check-complexity.js'],
    report: 'test-output/analysis/complexity-src-test.json',
  },
]);

function runRatchet({command, report}) {
  // The check writes its report before exiting non-zero on a ratchet failure,
  // so the exit code is recorded but the counts come from the report itself.
  let exitCode = 0;
  try {
    execFileSync(process.execPath, command, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    exitCode = typeof error.status === 'number' ? error.status : 1;
  }
  const parsed = JSON.parse(
    fs.readFileSync(path.join(ROOT, report), 'utf8'));
  return {
    exitCode,
    count: parsed.count,
    baseline: parsed.baselineCount,
    threshold: parsed.targetThreshold,
  };
}

const results = Object.fromEntries(
  RATCHETS.map((ratchet) => [ratchet.key, runRatchet(ratchet)]));
const excess = Object.values(results).reduce(
  (total, entry) => total + Math.max(0, entry.count - entry.baseline), 0);
const done = Object.values(results).every(
  (entry) => entry.exitCode === 0 && entry.count <= entry.baseline);

const oracle = {
  metric: excess,
  target: 0,
  done,
  classification: 'complexity-ratchet-closure-wave1',
  detail: results,
};

fs.mkdirSync(path.dirname(path.join(ROOT, ORACLE_PATH)), {recursive: true});
fs.writeFileSync(
  path.join(ROOT, ORACLE_PATH), `${JSON.stringify(oracle, null, 2)}\n`);
process.stdout.write(`${ORACLE_PATH}\n${JSON.stringify(
  {metric: excess, done, ...Object.fromEntries(Object.entries(results)
    .map(([key, entry]) => [key, `${entry.count}/${entry.baseline}`]))})}\n`);
