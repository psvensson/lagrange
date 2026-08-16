#!/usr/bin/env node

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTestFileSync} from './run-test-files.js';
import {emitDeterministicGuardReport} from './deterministic-guard-report.js';

// Deterministic guard for the lone-seed formation-admission livelock quest:
// the red-first deterministic-intent terminal-collision contract plus the
// sealed collision/retry and repository suites it must not regress.
const SCENARIO = 'lone-seed-formation-admission-livelock-closure';
const PRODUCER = 'lone-seed-formation-admission-livelock-closure-proof';
const PARENT_DIR = '..';
const GUARD_TIMEOUT_MS = 300000;
const GUARD_FILES = Object.freeze([
  'test/rebalancer/rebalance-coordinator-terminal-intent-collision.test.js',
  'test/partition/partition-service-row-absence-heal.test.js',
  'test/partition/partition-service-row-owner.test.js',
  'test/query/schema-provisioning-transient-collision.test.js',
  'test/query/durable-provisioning-job-owner-guard.test.js',
  'test/rebalancer/replica-operation-repository.test.js',
  'test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js',
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
