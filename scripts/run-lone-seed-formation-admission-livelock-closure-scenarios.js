#!/usr/bin/env node

import {runQuestGuardScenarios} from './run-quest-guard-scenarios.js';

// Deterministic guard for the lone-seed formation-admission livelock quest:
// the red-first deterministic-intent terminal-collision contract plus the
// sealed collision/retry and repository suites it must not regress.
const SCENARIO = 'lone-seed-formation-admission-livelock-closure';
const PRODUCER = 'lone-seed-formation-admission-livelock-closure-proof';
const GUARD_FILES = Object.freeze([
  'test/rebalancer/rebalance-coordinator-terminal-intent-collision.test.js',
  'test/partition/partition-service-row-absence-heal.test.js',
  'test/partition/partition-service-row-owner.test.js',
  'test/query/schema-provisioning-transient-collision.test.js',
  'test/query/durable-provisioning-job-owner-guard.test.js',
  'test/rebalancer/replica-operation-repository.test.js',
  'test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js',
]);

runQuestGuardScenarios({
  scenario: SCENARIO,
  producer: PRODUCER,
  guardFiles: GUARD_FILES,
});
