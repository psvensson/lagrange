#!/usr/bin/env node
// run-closure-repro — run a CL record's deterministic repro in sub-second.
//
// The docker stat-gate costs N≥8 × ~400s ≈ 50 min per verdict, and convergence
// fixes have repeatedly landed correct-but-inert. The closure-grammar
// reproduced-before-fix rung already mandates a deterministic (or recurrence-
// measured) repro before fix_in_progress; this runner makes that repro one
// command, so a candidate fix is falsified BEFORE paying for the gate.
//
// It does NOT build a simulator: the in-process fake-clock harnesses already
// exist (test/distributed/harness/deterministic-simulator.js,
// test/convergence/deterministic-convergence-harness.js) and service-level unit
// tests (the CL-035/CL-038 pattern). See docs/deterministic-repro-tier.md.
//
// Usage:
//   node scripts/run-closure-repro.js CL-038        # run its deterministic repro
//   node scripts/run-closure-repro.js --list        # list mapped repros
//   node scripts/run-closure-repro.js --check       # warn-only coverage report
//
// Resolution per CL: test/closure/registry.json wins, else the convention path
// test/closure/CL-###.repro.test.js.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {parseClosureLedger} from './closure-ledger-state.js';
import {runTestFileSync} from './run-test-files.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REGISTRY_PATH = path.join(ROOT, 'test/closure/registry.json');
const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_MISSING = 1;
// A repro is expected once a record has a fix to protect (or a reproduced rung).
const REPRO_EXPECTED_STATUSES = new Set([
  'reproduced', 'fix-landed', 'fix-in-progress', 'guarded', 'closed']);

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return {};
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')).repros || {};
}

export function conventionPath(id) {
  return `test/closure/${id}.repro.test.js`;
}

// Resolve a CL id to its repro test path, or null if none exists yet.
export function resolveRepro(id, registry) {
  if (registry[id] && fs.existsSync(path.join(ROOT, registry[id]))) {
    return registry[id];
  }
  const convention = conventionPath(id);
  return fs.existsSync(path.join(ROOT, convention)) ? convention : null;
}

function runOne(id) {
  const registry = loadRegistry();
  const repro = resolveRepro(id, registry);
  if (!repro) {
    process.stderr.write(
      `no repro for ${id}. Add one at ${conventionPath(id)} (or map it in ` +
      'test/closure/registry.json). See docs/deterministic-repro-tier.md.\n');
    return EXIT_MISSING;
  }
  process.stdout.write(`repro ${id} -> ${repro}\n`);
  const result = runTestFileSync(repro, {cwd: ROOT});
  return result.ok ? EXIT_OK : EXIT_MISSING;
}

function listRepros() {
  const registry = loadRegistry();
  const ids = Object.keys(registry).sort();
  if (ids.length === 0) {
    process.stdout.write('(no mapped repros)\n');
    return EXIT_OK;
  }
  for (const id of ids) process.stdout.write(`${id} -> ${registry[id]}\n`);
  return EXIT_OK;
}

// Warn-only: every record that should have a repro but does not. This is the
// WS11 coverage worklist, not a hard gate (records predate the convention).
function checkCoverage() {
  const registry = loadRegistry();
  const records = parseClosureLedger();
  const expected = records.filter((r) => REPRO_EXPECTED_STATUSES.has(r.status));
  const missing = expected.filter((r) => !resolveRepro(r.id, registry));
  const covered = expected.length - missing.length;
  process.stdout.write(
    `repro coverage: ${covered}/${expected.length} expected records have a repro ` +
    `(${missing.length} missing; ${records.length} records total).\n`);
  for (const r of missing) {
    process.stdout.write(`  MISSING ${r.id} (${r.status}) — ${r.concern || ''}\n`);
  }
  return EXIT_OK;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--list')) return listRepros();
  if (argv.includes('--check')) return checkCoverage();
  const id = argv.find((a) => /^CL-\d+$/i.test(a));
  if (!id) {
    process.stderr.write(
      'usage: run-closure-repro <CL-###> | --list | --check\n');
    return EXIT_USAGE;
  }
  return runOne(id.toUpperCase());
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
