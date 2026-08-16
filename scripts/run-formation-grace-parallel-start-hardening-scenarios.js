#!/usr/bin/env node

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTestFileSync} from './run-test-files.js';
import {emitDeterministicGuardReport} from './deterministic-guard-report.js';

// Deterministic guard for the formation grace + parallel-start hardening
// quest: the red-first placement-observation grace contract plus the
// sealed formation interlock and the node-joining suites the parallelized
// harness starts must not regress.
const SCENARIO = 'formation-grace-parallel-start-hardening';
const PRODUCER = 'formation-grace-parallel-start-hardening-proof';
const PARENT_DIR = '..';
const GUARD_TIMEOUT_MS = 300000;
const GUARD_FILES = Object.freeze([
  'test/bootstrap/formation-placement-observation-grace.test.js',
  'test/bootstrap/node-joining-service.test.js',
  'test/bootstrap/node-joining-service-join-lifecycle-resume.test.js',
  'test/rebalancer/formation-ledger-spread-voter-ready-readiness.test.js',
  'test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js',
  'test/convergence/dt6-formation-ledger-quorum-spread-first.test.js',
]);

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  PARENT_DIR,
);

function main() {
  const guards = GUARD_FILES.map((file) => ({
    file,
    ...runTestFileSync(file, {print: false, timeoutMs: GUARD_TIMEOUT_MS}),
  }));
  emitDeterministicGuardReport({
    root,
    scenario: SCENARIO,
    producer: PRODUCER,
    guards,
    deterministicPassed: guards.every((guard) => guard.ok === true),
  });
}

main();
